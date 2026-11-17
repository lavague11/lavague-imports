import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { searchTermsFor } from "@/lib/invoice-aliases";
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
// returns no SKU even though the product exists). Scores by token overlap.
async function catalogByName(prisma: PrismaClient, name: string, brand: string) {
  const terms = searchTermsFor(`${brand} ${name}`).slice(0, 8);
  if (terms.length === 0) return null;
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: terms.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, take: 1 } },
    take: 12,
  });
  if (products.length === 0) return null;
  const scored = products
    .map((p) => ({ p, score: terms.filter((t) => p.name.toLowerCase().includes(t)).length }))
    .sort((a, b) => b.score - a.score);
  if (scored[0].score < 2) return null; // need a couple of overlapping words to call it a match
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

// Fuzzy-match a spoken customer name against the customer list.
async function matchCustomer(prisma: PrismaClient, spoken: string) {
  const n = spoken.trim().toLowerCase();
  if (n.length < 2) return { customer: null, candidates: [] as { id: string; label: string }[] };
  const rows = await prisma.customer.findMany({
    orderBy: [{ businessName: "asc" }],
    select: { id: true, businessName: true, name: true, phone: true },
    take: 2000,
  });
  const scored = rows
    .map((r) => {
      const hay = `${r.businessName ?? ""} ${r.name ?? ""} ${r.phone ?? ""}`.toLowerCase();
      const words = n.split(/\s+/).filter(Boolean);
      const score = words.filter((w) => hay.includes(w)).length;
      return { r, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => ({ id: s.r.id, label: s.r.businessName || s.r.name || "Customer" }));
  return { customer: scored[0] ?? null, candidates: scored };
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
    "unit": "piece" | "case",// case if box/كرتونة/صندوق/carton/case
    "priceCents": number|null,
    "priceSource": "spoken" | "catalog" | "none",
    "matchTag": "matched" | "best guess" | "not in catalog",
    "isCredit": boolean,
    "creditReason": string   // if credit, one of [Damaged, Expired, Returned, Short delivery, Courtesy, Price adjustment, Other]; else ""
  }]
}
Match each item to the CANDIDATES below using brand + product + size (وزنية/wazneya = El Ouazzania extra virgin, المغربية = Al Maghribya, داري = Dari, بلبولة/belboula = Dari barley couscous). Prefer the candidate whose brand AND size match. Only use a SKU/price/brand from the candidates — never invent. If nothing fits, matchTag "not in catalog", sku "".
PRICE: "ب<n>"/"at n" = unit price; "الكل"/"total" = line total (÷ qty). No price spoken → matched catalog price, priceSource "catalog"; no match → null, "none".
CREDIT: "credit 2 cases harissa damaged" → isCredit true, reason Damaged. "$40 courtesy credit" → name "Credit", priceCents 4000, reason Courtesy.

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

        return { ...it, priceCents, priceSource, imageUrl };
      }),
    );

    const customerName = String(parsed?.customerName ?? "").trim();
    const customerMatch = customerName ? await matchCustomer(prisma, customerName) : { customer: null, candidates: [] };

    return NextResponse.json({ configured: true, items, heardCustomer: customerName || null, customer: customerMatch.customer, customerCandidates: customerMatch.candidates });
  } catch (error) {
    console.error("[voice] match failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
