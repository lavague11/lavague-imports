import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { searchTermsFor } from "@/lib/invoice-aliases";
import { CLOSE_ENOUGH, rankCustomers } from "@/lib/admin/customer-match";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";

// Turn a spoken (bilingual) order transcript into matched invoice line items + an optional
// customer. Admin-only. Pre-filters catalog candidates with the shared alias table, prices
// from the customer's last-paid price when available, and attaches catalog photos.
// Never invents a SKU, quantity, price or product.

interface Candidate { name: string; brand: string | null; imageUrl: string | null; sku: string; packSize: string; priceCents: number | null }

async function candidates(prisma: PrismaClient, transcript: string): Promise<Candidate[]> {
  const terms = searchTermsFor(transcript).slice(0, 14);
  if (terms.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: terms.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, brand: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, take: 1 } },
    take: 20,
  });
  return products.map((p) => ({
    name: p.name,
    brand: p.brand,
    imageUrl: p.imageUrl,
    sku: p.variants[0]?.sku ?? "",
    packSize: p.variants[0]?.name ?? "",
    priceCents: p.variants[0]?.retailPriceCents ?? null,
  }));
}

// Deterministic catalog match by an item's cleaned name (fallback when Sonnet
// returns no SKU even though the product exists). Requires the brand / most
// distinctive word so generic words like "olive oil" don't match the wrong brand.
async function catalogByName(prisma: PrismaClient, name: string, brand: string) {
  const terms = searchTermsFor(`${brand} ${name}`);
  if (terms.length === 0) return null;
  const brandTerms = brand.trim() ? searchTermsFor(brand) : [];
  const required = brandTerms[0] || [...terms].sort((a, b) => b.length - a.length)[0];
  if (!required || required.length < 4) return null; // need a distinctive anchor word
  const products = await prisma.product.findMany({
    where: { isActive: true, name: { contains: required, mode: "insensitive" } },
    select: { name: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, take: 1 } },
    take: 12,
  });
  if (products.length === 0) return null;
  const scored = products
    .map((p) => ({ p, score: terms.filter((t) => p.name.toLowerCase().includes(t)).length }))
    .sort((a, b) => b.score - a.score);
  const p = scored[0].p;
  return { name: p.name, sku: p.variants[0]?.sku ?? "", packSize: p.variants[0]?.name ?? "", priceCents: p.variants[0]?.retailPriceCents ?? null, imageUrl: p.imageUrl };
}

async function lastPaid(prisma: PrismaClient, customerId: string, name: string): Promise<{ cents: number; date: string } | null> {
  const line = await prisma.customerInvoiceLine.findFirst({
    where: { isCredit: false, description: { contains: name, mode: "insensitive" }, invoice: { customerId, status: { not: "VOID" } } },
    orderBy: { invoice: { issueDate: "desc" } },
    select: { unitPriceCents: true, invoice: { select: { issueDate: true } } },
  });
  return line ? { cents: line.unitPriceCents, date: line.invoice.issueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) } : null;
}

interface CustomerPick { id: string; label: string }
interface CustomerResolution {
  customer: CustomerPick | null;
  alternatives: CustomerPick[];
  confident: boolean;
}

// Resolve a spoken (possibly Arabic / misspelled) customer name to the closest
// customer. Fuzzy-ranks a shortlist, then lets Sonnet pick the best within it
// (bilingual, typo-tolerant); the fuzzy top is the fallback if the LLM can't run.
async function resolveCustomer(
  prisma: PrismaClient,
  client: Anthropic | null,
  spoken: string,
): Promise<CustomerResolution> {
  const rows = await prisma.customer.findMany({
    orderBy: [{ businessName: "asc" }],
    select: { id: true, businessName: true, name: true, phone: true },
    take: 4000,
  });
  const ranked = rankCustomers(rows, spoken, 60);
  if (ranked.length === 0) return { customer: null, alternatives: [], confident: false };

  // A candidate must share at least this much with the spoken name to count as a
  // real match — guards against the LLM force-picking something for an unknown name.
  const MATCH_FLOOR = 0.2;

  // Fuzzy default: only the top if it's clearly close.
  let picked = ranked[0].score >= CLOSE_ENOUGH ? ranked[0] : null;
  let confident = picked != null;

  if (client) {
    try {
      const list = ranked.map((r, i) => `${i}. ${r.label}`).join("\n");
      const prompt = `A wholesale order was dictated aloud. The speaker named the CUSTOMER it's for — possibly in Arabic, transliterated, or misspelled: "${spoken}".\nReturn the index of the ONE customer below that is clearly the SAME business (allowing for Arabic transliteration, accent, or spelling). If the spoken name does not clearly match any listed business, return -1 — do NOT guess.\nReply with ONLY JSON: {"index": <number or -1>, "confidence": <0..1>}.\n\n${list}`;
      const msg = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 80, messages: [{ role: "user", content: prompt }] });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as { index?: number; confidence?: number };
        if (typeof parsed.index === "number" && parsed.index >= 0 && parsed.index < ranked.length) {
          const cand = ranked[parsed.index];
          // Accept the LLM's pick only if it also shares enough with the spoken name.
          if (cand.score >= MATCH_FLOOR) {
            picked = cand;
            confident = (parsed.confidence ?? 0) >= 0.5 || cand.score >= CLOSE_ENOUGH;
          }
        } else if (parsed.index === -1) {
          // LLM says none plausible — keep only a strong fuzzy top.
          picked = ranked[0].score >= CLOSE_ENOUGH ? ranked[0] : null;
          confident = picked != null;
        }
      }
    } catch {
      /* fall back to the fuzzy default */
    }
  }

  if (!picked) return { customer: null, alternatives: [], confident: false };
  const alternatives = ranked.filter((r) => r.id !== picked!.id).slice(0, 2).map((r) => ({ id: r.id, label: r.label }));
  return { customer: { id: picked.id, label: picked.label }, alternatives, confident };
}

function parseJson(text: string, open: string, close: string): unknown {
  const s = text.indexOf(open);
  const e = text.lastIndexOf(close);
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const apiKey = getKey("ANTHROPIC_API_KEY") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ configured: true, error: "db" });

  const fd = await request.formData().catch(() => null);
  const transcript = String(fd?.get("transcript") ?? "").trim();
  const customerId = String(fd?.get("customerId") ?? "").trim() || null;
  if (!transcript) return NextResponse.json({ configured: true, items: [] });

  const cands = await candidates(prisma, transcript);

  const prompt = `You are taking a spoken wholesale grocery order for a North African / Middle Eastern importer. The transcript mixes Egyptian/Moroccan/Algerian Arabic and English and may include CREDITS and a CUSTOMER name. Return ONLY a JSON object (no prose, no fences):
{
  "customerName": string,   // if the speaker says who it's for ("invoice for X", "لـ X", "للزعيم"), the name; else ""
  "items": [{
    "heard": string,
    "name": string,          // matched catalog product name, or a clean English name; "Credit" for a money credit
    "brand": string,
    "sku": string,           // matched catalog SKU, or "" — NEVER invent
    "packSize": string,
    "quantity": number,      // Arabic/English numbers (واحدة/one=1, اتنين/two=2, تلاتة/three=3 ...); default 1
    "quantitySpoken": boolean,// true ONLY if the speaker actually said a number for THIS item; false if you defaulted to 1
    "unit": "piece" | "case",// case if box/كرتونة/صندوق/carton/case
    "priceCents": number|null,
    "priceSource": "spoken" | "catalog" | "none",
    "matchTag": "matched" | "best guess" | "not in catalog",
    "isCredit": boolean,
    "creditReason": string   // ONLY if the speaker actually stated a reason, one of [Damaged, Expired, Returned, Short delivery, Courtesy, Price adjustment, Other]; if no reason was spoken, "" (do NOT guess or default to Other)
  }]
}
Match each item to the CANDIDATES below using brand + product + size (وزنية/wazneya = El Ouazzania extra virgin, المغربية = Al Maghribya, داري = Dari, بلبولة/belboula = Dari barley couscous). Prefer the candidate whose brand AND size match. Only use a SKU/price/brand from the candidates — never invent. If nothing fits, matchTag "not in catalog", sku "".
PRICE: "ب<n>"/"at n" = unit price; "الكل"/"total" = line total (÷ qty). No price spoken → matched catalog price, priceSource "catalog"; no match → null, "none".
CREDIT: "credit 2 cases harissa damaged" → isCredit true, reason Damaged. "$40 courtesy credit" → name "Credit", priceCents 4000, reason Courtesy. "credit 2 cases harissa" (no reason said) → isCredit true, creditReason "".

CANDIDATES:
${JSON.stringify(cands, null, 1)}

TRANSCRIPT:
${transcript}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content: prompt }] });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const parsed = parseJson(text, "{", "}") as { customerName?: string; items?: Record<string, unknown>[] } | null;
    const rawItems = Array.isArray(parsed?.items) ? parsed!.items : [];

    const bySku = new Map(cands.filter((c) => c.sku).map((c) => [c.sku, c]));
    const items = await Promise.all(
      rawItems.map(async (raw) => {
        const it = { ...raw } as Record<string, unknown>;
        it.quantitySpoken = Boolean(it.quantitySpoken);
        let sku = String(it.sku ?? "");
        const isCredit = Boolean(it.isCredit);
        let matchName = sku ? bySku.get(sku)?.name ?? String(it.name ?? "") : String(it.name ?? "");
        let imageUrl: string | null = sku ? bySku.get(sku)?.imageUrl ?? null : null;
        let priceCents = (it.priceCents as number | null) ?? null;
        let priceSource = String(it.priceSource ?? "none");

        // Deterministic fallback: Sonnet gave no SKU but the product likely exists.
        if (!sku && !isCredit) {
          const fb = await catalogByName(prisma, String(it.name ?? ""), String(it.brand ?? ""));
          if (fb) {
            sku = fb.sku; matchName = fb.name; imageUrl = fb.imageUrl;
            it.name = fb.name; it.sku = fb.sku; it.packSize = fb.packSize; it.matchTag = "best guess";
            if (priceSource !== "spoken") { priceCents = fb.priceCents; priceSource = fb.priceCents != null ? "catalog" : "none"; }
          }
        }

        // Prefer this customer's last-paid price for matched, non-spoken, non-credit items.
        if (customerId && sku && !isCredit && priceSource !== "spoken") {
          const lp = await lastPaid(prisma, customerId, matchName);
          if (lp) { priceCents = lp.cents; priceSource = "last"; }
        }

        // Up to 3 catalog alternatives for this item, so the card can offer a
        // "change match" without a round-trip. Scored by name-word overlap.
        const q = `${String(it.brand ?? "")} ${String(it.name ?? "")}`.toLowerCase();
        const qWords = q.split(/[^a-z0-9؀-ۿ]+/i).filter((w) => w.length >= 3);
        const alternatives = cands
          .filter((c) => c.sku && c.sku !== sku)
          .map((c) => ({ c, score: qWords.filter((w) => c.name.toLowerCase().includes(w)).length }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((x) => ({ name: x.c.name, brand: x.c.brand, sku: x.c.sku, packSize: x.c.packSize, priceCents: x.c.priceCents, imageUrl: x.c.imageUrl }));

        return { ...it, sku, priceCents, priceSource, imageUrl, alternatives };
      }),
    );

    const customerName = String(parsed?.customerName ?? "").trim();
    const resolution = customerName
      ? await resolveCustomer(prisma, client, customerName)
      : { customer: null, alternatives: [], confident: false };

    return NextResponse.json({
      configured: true,
      items,
      heardCustomer: customerName || null,
      customer: resolution.customer,
      customerAlternatives: resolution.alternatives,
      customerConfident: resolution.confident,
    });
  } catch (error) {
    console.error("[voice] match failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
