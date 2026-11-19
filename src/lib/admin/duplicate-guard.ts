import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { normText } from "@/lib/admin/product-tags";
import { findCatalogDuplicates, type CatalogHit } from "@/lib/admin/voice-catalog";

// One shared duplicate guard for EVERY new-item path — voice, manual, photo,
// barcode, bulk (PRODUCT_TAGS §5). Matches on: exact barcode, brand+type+size &
// fuzzy name (via findCatalogDuplicates), and spoken-name tags. An exact barcode
// match is authoritative → the caller blocks creation and opens the existing one.

export interface SimilarResult {
  /** Exact barcode match → block creation, open this product. */
  exactBarcode: (CatalogHit & { slug: string }) | null;
  /** Other close matches (brand+size / fuzzy name / spoken alias), top 3. */
  similar: (CatalogHit & { slug: string })[];
}

interface Row {
  slug: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  variants: { sku: string; name: string; retailPriceCents: number | null }[];
}
const toHit = (p: Row): CatalogHit & { slug: string } => ({
  slug: p.slug,
  name: p.name,
  brand: p.brand,
  sku: p.variants[0]?.sku ?? "",
  packSize: p.variants[0]?.name ?? "",
  priceCents: p.variants[0]?.retailPriceCents ?? null,
  imageUrl: p.imageUrl,
});
const SELECT = { slug: true, name: true, brand: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, orderBy: { position: "asc" as const }, take: 1 } };

export async function findSimilarProducts(
  prisma: PrismaClient,
  input: { barcode?: string | null; name: string; brand?: string | null; size?: string | null },
): Promise<SimilarResult> {
  // 1. Exact barcode (authoritative).
  let exactBarcode: (CatalogHit & { slug: string }) | null = null;
  const bc = (input.barcode ?? "").replace(/\D/g, "");
  if (bc.length >= 6) {
    const p = await prisma.product.findFirst({ where: { barcode: bc }, select: SELECT });
    if (p) exactBarcode = toHit(p as Row);
  }

  const bySlug = new Map<string, CatalogHit & { slug: string }>();

  // 2/3. brand + size + fuzzy name.
  const dupes = await findCatalogDuplicates(prisma, input.name, input.brand ?? "", input.size ?? "");
  for (const d of dupes) {
    // findCatalogDuplicates returns CatalogHit (no slug) — look up the slug by sku.
    if (!d.sku) continue;
    const v = await prisma.productVariant.findUnique({ where: { sku: d.sku }, select: { product: { select: SELECT } } });
    if (v?.product) { const h = toHit(v.product as Row); bySlug.set(h.slug, h); }
  }

  // 4. Spoken-name tags → the product that answers to this spoken name.
  const norm = normText(input.name);
  const tokens = norm.split(" ").filter((t) => t.length >= 3);
  if (tokens.length) {
    const tags = await prisma.productTag.findMany({
      where: { kind: "SPOKEN", OR: tokens.map((t) => ({ norm: { contains: t } })) },
      select: { slug: true },
      take: 20,
    });
    const slugs = [...new Set(tags.map((t) => t.slug))].filter((s) => !bySlug.has(s)).slice(0, 5);
    if (slugs.length) {
      const prods = await prisma.product.findMany({ where: { slug: { in: slugs } }, select: SELECT });
      for (const p of prods) { const h = toHit(p as Row); bySlug.set(h.slug, h); }
    }
  }

  const similar = [...bySlug.values()].filter((h) => h.slug !== exactBarcode?.slug).slice(0, 3);
  return { exactBarcode, similar };
}
