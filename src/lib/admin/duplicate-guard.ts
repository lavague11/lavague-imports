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

// --- Batched guard for big imports (PRODUCT_TAGS §5) -------------------------
// Loads the catalog + spoken tags ONCE, then matches every row in memory via a
// token inverted index (only bigram-scores candidates that share a word), so a
// 2,500-row check stays fast instead of 2,500 × multi-contains DB round-trips.

function norm2(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9؀-ۿ\s]/g, " ").replace(/\s+/g, " ").trim();
}
function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2));
  return set;
}
function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return (2 * inter) / (a.size + b.size);
}

export interface BatchRowResult { exactBarcode: string | null; similar: { slug: string; name: string }[] }

export async function findSimilarBatch(
  prisma: PrismaClient,
  rows: { name: string; brand?: string | null; barcode?: string | null }[],
): Promise<BatchRowResult[]> {
  const products = await prisma.product.findMany({ select: { slug: true, name: true, brand: true, barcode: true } });
  const idx: { slug: string; name: string; norm: string; bg: Set<string> }[] = products.map((p) => {
    const norm = norm2(`${p.brand ?? ""} ${p.name}`);
    return { slug: p.slug, name: p.name, norm, bg: bigrams(norm) };
  });
  const byBarcode = new Map<string, string>();
  for (const p of products) { const bc = (p.barcode ?? "").replace(/\D/g, ""); if (bc.length >= 6) byBarcode.set(bc, p.slug); }

  // token → product-index postings
  const postings = new Map<string, number[]>();
  idx.forEach((p, i) => {
    for (const tok of new Set(p.norm.split(" ").filter((t) => t.length >= 3))) {
      const arr = postings.get(tok); if (arr) arr.push(i); else postings.set(tok, [i]);
    }
  });

  return rows.map((row) => {
    const bc = (row.barcode ?? "").replace(/\D/g, "");
    const exactBarcode = bc.length >= 6 ? byBarcode.get(bc) ?? null : null;
    const q = norm2(`${row.brand ?? ""} ${row.name}`);
    const qbg = bigrams(q);
    const cand = new Set<number>();
    for (const tok of new Set(q.split(" ").filter((t) => t.length >= 3))) for (const i of postings.get(tok) ?? []) cand.add(i);
    const scored = [...cand]
      .map((i) => ({ p: idx[i], s: dice(qbg, idx[i].bg) }))
      .filter((x) => x.s >= 0.5 && x.p.slug !== exactBarcode)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => ({ slug: x.p.slug, name: x.p.name }));
    return { exactBarcode, similar: scored };
  });
}
