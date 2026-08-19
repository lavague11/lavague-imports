/**
 * Storefront-facing catalog types. Deliberately independent of the Prisma
 * models so the same shapes serve both the database and the generated catalog.
 */

export interface Variant {
  id: string;
  sku: string;
  /** Size or pack label, e.g. "1 L", "Each", "Case of 24". */
  name: string;
  /** Null means "price on request" — the item is quoted, not listed. */
  retailPriceCents: number | null;
  compareAtPriceCents: number | null;
  unitsPerCase: number | null;
  minOrderCases: number | null;
  inStock: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string;
  origin: string | null;
  brand: string | null;
  imageUrl: string | null;
  /** Internal: which import source this product came from (admin-only). */
  source?: string | null;
  /** Freeform source ribbon, e.g. "Best Seller", "HOT ITEM", "Only 2 Left". */
  ribbon: string | null;
  isFeatured: boolean;
  /** Primary, curated category (drives the shop nav). */
  categorySlug: string;
  categoryName: string;
  /** Every raw source collection, for the shop's collection filters. */
  collections: string[];
  variants: Variant[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface CollectionFilter {
  name: string;
  slug: string;
  count: number;
}

export interface CountryFilter {
  name: string;
  slug: string;
  /** Flag emoji for the country. */
  flag: string;
  count: number;
}

/**
 * The cheapest variant that carries a price, or the first variant if the whole
 * product is quote-only. Used for "from $X" labels.
 */
export function lowestPricedVariant(product: Product): Variant {
  const priced = product.variants.filter((v) => v.retailPriceCents !== null);
  if (priced.length === 0) return product.variants[0];
  return priced.reduce((cheapest, variant) =>
    variant.retailPriceCents! < cheapest.retailPriceCents! ? variant : cheapest,
  );
}

export function isOnSale(variant: Variant) {
  return (
    variant.retailPriceCents !== null &&
    variant.compareAtPriceCents !== null &&
    variant.compareAtPriceCents > variant.retailPriceCents
  );
}

export function hasPrice(product: Product) {
  return product.variants.some((v) => v.retailPriceCents !== null);
}

/** Human-readable label for a product's internal import source (admin-only). */
export const SOURCE_LABELS: Record<string, string> = {
  wix: "La Vague (Wix)",
  halalco: "halalco.com",
  ziyad: "Ziyad",
  fattals: "Fattal's",
  mog: "Moroccan Olive Grove",
  yemen: "Yemen catalog",
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "Manual";
  return SOURCE_LABELS[source] ?? source;
}

// Seasonings/bouillon that keyword-land in the meat category but aren't zabiha
// meat. "Cubes" alone isn't enough (a "Beef Stew (Beef Cubes)" is real meat),
// so it only counts as seasoning alongside a bouillon brand.
const SEASONING = /\b(bouillon|stock|broth|seasoning|flavou?r|noodles?|instant|granules?|powder|masala)\b/i;
const BOUILLON_BRAND = /\b(golden|doobi|zaghloul|maggi|knorr)\b/i;

/** True only for genuine zabiha meat — used to place the halal badge. */
export function isZabihaMeat(product: Product): boolean {
  if (product.categorySlug !== "meat") return false;
  const name = product.name;
  if (SEASONING.test(name)) return false;
  if (/\bcubes?\b/i.test(name) && BOUILLON_BRAND.test(name)) return false;
  return true;
}
