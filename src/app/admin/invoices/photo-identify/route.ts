import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { searchTermsFor } from "@/lib/invoice-aliases";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";

// Identify products from invoice photos, then search the catalog FIRST (barcode →
// brand+name+size → aliases) so we never create a duplicate. Returns, per item, the
// best catalog match + up to 3 alternatives + the fields to prefill a new product if
// it's truly new. Admin-only. Needs ANTHROPIC_API_KEY.

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface CatMatch {
  name: string;
  sku: string;
  priceCents: number | null;
  priceSource: "last" | "catalog";
  packSize: string;
  imageUrl: string | null;
  slug: string;
}

async function lastPaid(prisma: PrismaClient, customerId: string, name: string): Promise<number | null> {
  const line = await prisma.customerInvoiceLine.findFirst({
    where: { isCredit: false, description: { contains: name, mode: "insensitive" }, invoice: { customerId, status: { not: "VOID" } } },
    orderBy: { invoice: { issueDate: "desc" } },
    select: { unitPriceCents: true },
  });
  return line?.unitPriceCents ?? null;
}

async function searchCatalog(
  prisma: PrismaClient,
  item: { name?: string; brand?: string; barcode?: string },
  customerId: string | null,
): Promise<{ best: CatMatch | null; alternatives: Omit<CatMatch, "priceSource">[] }> {
  const toMatch = async (p: { name: string; slug: string; imageUrl: string | null; variants: { sku: string; name: string; retailPriceCents: number | null }[] }): Promise<CatMatch> => {
    const catalogPrice = p.variants[0]?.retailPriceCents ?? null;
    const last = customerId ? await lastPaid(prisma, customerId, p.name) : null;
    return {
      name: p.name,
      sku: p.variants[0]?.sku ?? "",
      priceCents: last ?? catalogPrice,
      priceSource: last != null ? "last" : "catalog",
      packSize: p.variants[0]?.name ?? "",
      imageUrl: p.imageUrl,
      slug: p.slug,
    };
  };

  // 1. Barcode = exact.
  const barcode = (item.barcode ?? "").replace(/[^0-9]/g, "");
  if (barcode.length >= 6) {
    const hit = await prisma.product.findFirst({ where: { barcode }, select: { name: true, slug: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, take: 1 } } });
    if (hit) return { best: await toMatch(hit), alternatives: [] };
  }

  // 2. Brand + name + aliases → token search, ranked by overlap.
  const terms = searchTermsFor(`${item.brand ?? ""} ${item.name ?? ""}`).slice(0, 8);
  if (terms.length === 0) return { best: null, alternatives: [] };
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: terms.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, slug: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, take: 1 } },
    take: 12,
  });
  const scored = products
    .map((p) => ({ p, score: terms.filter((t) => p.name.toLowerCase().includes(t)).length }))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { best: null, alternatives: [] };

  const best = await toMatch(scored[0].p);
  const alternatives = await Promise.all(scored.slice(1, 4).map((s) => toMatch(s.p)));
  return { best, alternatives: alternatives.map(({ priceSource: _ps, ...rest }) => rest) };
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

  const fd = await request.formData();
  const customerId = String(fd.get("customerId") ?? "").trim() || null;
  const files = fd.getAll("image").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
  if (files.length === 0) return NextResponse.json({ configured: true, items: [] });

  const imageBlocks = await Promise.all(
    files.map(async (f) => {
      const mediaType = MEDIA_TYPES.includes(f.type) ? f.type : "image/jpeg";
      const data = Buffer.from(await f.arrayBuffer()).toString("base64");
      return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg", data } };
    }),
  );

  const categories = await getCategories();
  const catList = categories.map((c) => `${c.slug} (${c.name})`).join(", ");

  const prompt = `These photos show grocery products to put on a wholesale invoice. Identify each distinct product and return ONLY a JSON array (no prose, no fences):
[{
  "name": string,            // product name including brand if visible
  "brand": string,           // brand only, "" if unknown
  "size": string,            // size like "1 L", "500 g", "" if unknown
  "barcode": string,         // digits only if a barcode is clearly visible, else ""
  "categorySlug": string,    // best match from: ${catList}; else ""
  "piecesPerCase": number|null, // if printed on the pack, else null
  "suggestedSku": string     // short uppercase BRAND-PRODUCT-SIZE, best effort
}]`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return NextResponse.json({ configured: true, items: [] });
    const identified = JSON.parse(text.slice(start, end + 1)) as { name?: string; brand?: string; size?: string; barcode?: string; categorySlug?: string; piecesPerCase?: number | null; suggestedSku?: string }[];

    const items = await Promise.all(
      identified.map(async (it) => {
        const { best, alternatives } = await searchCatalog(prisma, it, customerId);
        return { identified: it, match: best, alternatives };
      }),
    );
    return NextResponse.json({ configured: true, items });
  } catch (error) {
    console.error("[invoice] photo-identify failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
