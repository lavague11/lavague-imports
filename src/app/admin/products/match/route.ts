import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { nameKey } from "@/lib/clean-name";
import { getPrisma } from "@/lib/db";

// Match confidence for a photographed product (PRODUCTS_UI §6). Tags are based
// on what ACTUALLY matched the catalog, not the AI's self-confidence:
//   strong   — a barcode or SKU hit whose name also agrees
//   possible — a barcode/SKU hit whose name disagrees, or a close name match
//   none     — photo guess only (no catalog hit)
type Hit = { slug: string; name: string; brand: string | null };

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ tag: "none", match: null, alternatives: [] }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ tag: "none", match: null, alternatives: [] });

  let body: { name?: string; brand?: string; sku?: string; barcode?: string; size?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ tag: "none", match: null, alternatives: [] });
  }
  const name = (body.name || "").trim();
  const brand = (body.brand || "").trim();
  const sku = (body.sku || "").trim();
  const barcode = (body.barcode || "").replace(/[^0-9]/g, "");
  const size = (body.size || "").trim();

  const tokens = nameKey(name, brand, size).split(" ").filter((w) => w.length >= 3);
  const nameAgrees = (hit: Hit) => {
    const hay = nameKey(hit.name, hit.brand ?? "", "");
    const overlap = tokens.filter((t) => hay.includes(t)).length;
    return tokens.length > 0 && overlap >= Math.min(tokens.length, 2);
  };

  // Barcode / SKU hits (identity).
  let idHit: Hit | null = null;
  if (barcode) {
    const p = await prisma.product.findFirst({ where: { barcode }, select: { slug: true, name: true, brand: true } });
    if (p) idHit = p;
  }
  if (!idHit && sku) {
    const v = await prisma.productVariant.findUnique({ where: { sku }, select: { product: { select: { slug: true, name: true, brand: true } } } });
    if (v) idHit = v.product;
  }

  // Name candidates.
  const candidates: Hit[] = tokens.length
    ? await prisma.product.findMany({
        where: { OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
        select: { slug: true, name: true, brand: true },
        take: 25,
      })
    : [];
  const scored = candidates
    .map((c) => ({ c, score: tokens.filter((t) => nameKey(c.name, c.brand ?? "", "").includes(t)).length }))
    .sort((a, b) => b.score - a.score);
  const topName = scored[0];

  let tag: "strong" | "possible" | "none" = "none";
  let match: Hit | null = null;
  if (idHit && nameAgrees(idHit)) {
    tag = "strong";
    match = idHit;
  } else if (idHit) {
    tag = "possible";
    match = idHit;
  } else if (topName && topName.score >= Math.min(tokens.length, 3) && topName.score >= 2) {
    tag = "possible";
    match = topName.c;
  }

  const alternatives = scored
    .filter((s) => s.c.slug !== match?.slug)
    .slice(0, 3)
    .map((s) => s.c);

  return NextResponse.json({ tag, match, alternatives });
}
