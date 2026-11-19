import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { searchTermsFor } from "@/lib/invoice-aliases";

// Shared catalog lookup for the voice-order card: search the catalog for
// alternatives, and check whether a product already exists before creating one.
// Returns a compact, line-ready shape. Never creates anything.

export interface CatalogHit {
  name: string;
  brand: string | null;
  sku: string;
  packSize: string;
  priceCents: number | null;
  imageUrl: string | null;
  /** This customer's last-paid price for the product, when known (picker, §3). */
  lastPaidCents?: number | null;
}

interface ProductRow {
  name: string;
  brand: string | null;
  imageUrl: string | null;
  variants: { sku: string; name: string; retailPriceCents: number | null }[];
}

const toHit = (p: ProductRow): CatalogHit => ({
  name: p.name,
  brand: p.brand,
  sku: p.variants[0]?.sku ?? "",
  packSize: p.variants[0]?.name ?? "",
  priceCents: p.variants[0]?.retailPriceCents ?? null,
  imageUrl: p.imageUrl,
});

// Split a query into usable terms — alias table (bilingual) plus raw words,
// including Arabic (؀-ۿ).
function queryTerms(query: string): string[] {
  const aliasTerms = searchTermsFor(query);
  const words = query.toLowerCase().split(/[^a-z0-9؀-ۿ]+/i).filter((w) => w.length >= 2);
  return Array.from(new Set([...aliasTerms, ...words])).slice(0, 14);
}

/** Free-text catalog search for the "change match" / "search" box. */
export async function searchCatalog(prisma: PrismaClient, query: string, limit = 6): Promise<CatalogHit[]> {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: terms.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, brand: true, imageUrl: true, variants: { select: { sku: true, name: true, retailPriceCents: true }, take: 1 } },
    take: 30,
  });
  const scored = products
    .map((p) => ({ p, score: terms.filter((t) => p.name.toLowerCase().includes(t.toLowerCase())).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => toHit(s.p));
}

/** Does a product like this already exist? Matches on brand + name (size nudges
 *  the ranking). Returns up to 3 close matches, strongest first. */
export async function findCatalogDuplicates(
  prisma: PrismaClient,
  name: string,
  brand: string,
  size: string,
): Promise<CatalogHit[]> {
  const hits = await searchCatalog(prisma, `${brand} ${name}`.trim(), 8);
  const nameWords = name.toLowerCase().split(/[^a-z0-9؀-ۿ]+/i).filter((w) => w.length >= 3);
  const brandL = brand.trim().toLowerCase();
  const sizeDigits = (size || "").replace(/[^0-9]/g, "");
  return hits
    .map((h) => {
      const hn = h.name.toLowerCase();
      const brandOk = brandL ? hn.includes(brandL) || (h.brand ?? "").toLowerCase().includes(brandL) : true;
      const nameOk = nameWords.length === 0 || nameWords.some((w) => hn.includes(w));
      const sizeBonus = sizeDigits && (h.packSize || "").replace(/[^0-9]/g, "").includes(sizeDigits) ? 1 : 0;
      const score = (brandOk ? 1 : 0) + (nameOk ? 1 : 0) + sizeBonus;
      return { h, ok: brandOk && nameOk, score };
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.h);
}
