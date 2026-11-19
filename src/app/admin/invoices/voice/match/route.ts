import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { searchTermsFor } from "@/lib/invoice-aliases";
import { CLOSE_ENOUGH, rankCustomers } from "@/lib/admin/customer-match";
import { resolveSpokenItem } from "@/lib/admin/tag-match";
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

    const items = await Promise.all(
      rawItems.map(async (raw) => {
        const it = { ...raw } as Record<string, unknown>;
        it.quantitySpoken = Boolean(it.quantitySpoken);
        const isCredit = Boolean(it.isCredit);
        let priceCents = (it.priceCents as number | null) ?? null;
        let priceSource = String(it.priceSource ?? "none");

        if (isCredit) {
          return { ...it, sku: String(it.sku ?? ""), priceCents, priceSource, imageUrl: null, alternatives: [], vague: false, usualQty: null };
        }

        // Tag-first resolution: history → tag → fuzzy → fallback.
        const r = await resolveSpokenItem(prisma, {
          name: String(it.name ?? ""), brand: String(it.brand ?? ""), size: String(it.packSize ?? ""), customerId,
        });

        let sku = "";
        let imageUrl: string | null = null;
        let usualQty: number | null = null;
        it.matchTag = "not in catalog";

        if (r.match) {
          sku = r.match.sku;
          it.name = r.match.name;
          it.brand = r.match.brand ?? it.brand;
          it.packSize = r.match.packSize;
          imageUrl = r.match.imageUrl;
          usualQty = r.match.usualQty;
          it.matchTag = r.match.source === "history" || r.match.confidence >= 0.72 ? "matched" : "best guess";

          if (priceSource !== "spoken") {
            if (customerId) { const lp = await lastPaid(prisma, customerId, r.match.name); if (lp) { priceCents = lp.cents; priceSource = "last"; } }
            if (priceSource !== "last" && priceSource !== "spoken") { priceCents = r.match.priceCents; priceSource = r.match.priceCents != null ? "catalog" : "none"; }
          }
        }

        // Default the quantity to how this customer usually orders it (plain numbers only).
        if (!it.quantitySpoken && usualQty && usualQty > 0) it.quantity = usualQty;

        // Picker options (§3): attach this customer's last-paid price per option.
        const alternatives = customerId
          ? await Promise.all(r.alternatives.map(async (a) => ({ ...a, lastPaidCents: (await lastPaid(prisma, customerId, a.name))?.cents ?? null })))
          : r.alternatives;
        const lastPaidCents = priceSource === "last" ? priceCents : null;

        return { ...it, sku, priceCents, priceSource, imageUrl, alternatives, vague: Boolean(r.vague), ambiguous: Boolean(r.ambiguous), usualQty, lastPaidCents };
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
