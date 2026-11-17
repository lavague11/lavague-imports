import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";

// Turn a spoken (bilingual) order transcript into matched invoice line items.
// Admin-only. Pre-filters catalog candidates cheaply (text similarity + brand
// aliases) before asking Claude Sonnet to extract qty/unit/price and match.
// Never invents a SKU, quantity, price or product — unknowns come back blank/"best guess".

// Arabic → English brand aliases, so an Arabic-only mention still seeds the catalog search.
const BRAND_ALIASES: Record<string, string> = {
  وزنية: "ouazzania",
  ملسوكة: "malsouka",
  سلطان: "sultan",
  شاكور: "chakour",
  طيب: "tayeb",
  ايديال: "ideal",
  إيديال: "ideal",
  زيت: "oil",
  زيتون: "olive",
};

function searchTerms(transcript: string): string[] {
  const latin = transcript.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const aliased: string[] = [];
  for (const [ar, en] of Object.entries(BRAND_ALIASES)) if (transcript.includes(ar)) aliased.push(en);
  return [...new Set([...latin, ...aliased])].slice(0, 12);
}

async function candidates(prisma: PrismaClient, transcript: string) {
  const terms = searchTerms(transcript);
  if (terms.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: terms.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, brand: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, take: 1 } },
    take: 16,
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

function parseJsonArray(text: string): unknown {
  const s = text.indexOf("[");
  const e = text.lastIndexOf("]");
  if (s === -1 || e === -1) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
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
  if (!transcript) return NextResponse.json({ configured: true, items: [] });

  const cands = await candidates(prisma, transcript);

  const prompt = `You are taking a spoken wholesale grocery order for a North African / Middle Eastern importer. The transcript mixes Egyptian/Moroccan/Algerian Arabic and English. It may include CREDITS (returns/refunds/discounts). Convert it into invoice line items and return ONLY a JSON array (no prose, no fences), one object per distinct product or credit:
[{
  "heard": string,          // the exact phrase for this item, as transcribed
  "name": string,           // matched catalog product name, or a clean English name if no match; for a pure money credit use "Credit"
  "brand": string,          // brand if known, else ""
  "sku": string,            // matched catalog SKU, or "" if no match — NEVER invent one
  "packSize": string,       // catalog pack/size label if matched, else ""
  "quantity": number,       // parse Arabic/English number words or digits (واحدة/one=1, اتنين/two=2, تلاتة/three=3 ...); default 1
  "unit": "piece" | "case", // "case" if كرتونة/صندوق/carton/case is said, else "piece"
  "priceCents": number|null,// per-unit price in cents if matched or spoken (see rules); for a money credit, the credit amount; else null — NEVER invent
  "priceSource": "spoken" | "catalog" | "none",
  "matchTag": "matched" | "best guess" | "not in catalog",
  "isCredit": boolean,      // true if this is a credit / return / refund / discount (كريدت, credit, "give him $X credit", "اعمله كريدت", a damaged/expired return, etc.)
  "creditReason": string    // only if isCredit: map the spoken reason to EXACTLY one of [Damaged, Expired, Returned, Short delivery, Courtesy, Price adjustment, Other]. Arabic: تالف/damaged=Damaged, منتهي الصلاحية/expired=Expired, مرتجع/returned=Returned, نقص/short=Short delivery, هدية/courtesy=Courtesy. "" if no reason was spoken.
}]
PRICE RULES: "ب<number>" or "at <number>" = unit price each. "الكرتونة"/"per case" = price per case. "الكل"/"total" = line total for the whole quantity (divide by quantity for priceCents). If no price is spoken, use the matched catalog price and set priceSource "catalog"; if there's no catalog match either, priceCents null and priceSource "none".
CREDIT RULES: "credit 2 cases harissa damaged" → isCredit true, match harissa, quantity 2, unit case, creditReason "Damaged", priceCents from the catalog/last price. "give him $40 courtesy credit" / "اعمله كريدت بأربعين" → isCredit true, name "Credit", quantity 1, priceCents 4000, creditReason "Courtesy". A normal order item has isCredit false and creditReason "".
Only use a SKU/price/brand from the CANDIDATES below — never make one up. If nothing fits, matchTag "not in catalog", sku "", but still give a clean English name and the heard phrase.

CATALOG CANDIDATES:
${JSON.stringify(cands, null, 1)}

TRANSCRIPT:
${transcript}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const items = parseJsonArray(text);
    // Attach catalog photos for matched items (by SKU) so the cards can show them.
    const bySku = new Map(cands.filter((c) => c.sku).map((c) => [c.sku, c]));
    const withPhotos = Array.isArray(items)
      ? (items as { sku?: string }[]).map((it) => ({ ...it, imageUrl: it.sku ? bySku.get(it.sku)?.imageUrl ?? null : null }))
      : [];
    return NextResponse.json({ configured: true, items: withPhotos });
  } catch (error) {
    console.error("[voice] match failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
