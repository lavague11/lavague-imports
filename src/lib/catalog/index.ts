import "server-only";

import { getPrisma } from "@/lib/db";
import {
  categories as seedCategories,
  collectionFilters as seedCollectionFilters,
  countryFilters as seedCountryFilters,
  products as seedProducts,
} from "./data";
import type {
  Category,
  CollectionFilter,
  CountryFilter,
  Product,
} from "./types";

export * from "./types";

/**
 * Catalog reads go through here. When DATABASE_URL is set the data comes from
 * Postgres; otherwise the generated catalog is served so the storefront still
 * renders during development and before the first migration.
 */

/** The shape of the `product` rows the queries below select. */
interface ProductRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string;
  origin: string | null;
  brand: string | null;
  imageUrl: string | null;
  images: string[];
  source: string | null;
  minPriceCents: number | null;
  ribbon: string | null;
  collections: string[];
  isFeatured: boolean;
  isFragile: boolean;
  category: { slug: string; name: string };
  variants: {
    id: string;
    sku: string;
    name: string;
    retailPriceCents: number | null;
    compareAtPriceCents: number | null;
    unitsPerCase: number | null;
    minOrderCases: number | null;
    inStock: boolean;
  }[];
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    origin: row.origin,
    brand: row.brand,
    imageUrl: row.imageUrl,
    images: row.images ?? [],
    source: row.source,
    minPriceCents: row.minPriceCents,
    ribbon: row.ribbon,
    isFeatured: row.isFeatured,
    isFragile: row.isFragile,
    categorySlug: row.category.slug,
    categoryName: row.category.name,
    collections: row.collections,
    variants: row.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      retailPriceCents: variant.retailPriceCents,
      compareAtPriceCents: variant.compareAtPriceCents,
      unitsPerCase: variant.unitsPerCase,
      minOrderCases: variant.minOrderCases,
      inStock: variant.inStock,
    })),
  };
}

/**
 * Logs a database read failure and signals the caller to use the generated
 * fallback catalog. Keeps the storefront serving if the database is briefly
 * unreachable (e.g. connection limits, or a temporary DB that has expired).
 */
function onDbError(scope: string, error: unknown): null {
  console.error(`[catalog] ${scope} DB read failed; using fallback catalog`, error);
  return null;
}

export async function getCategories(): Promise<Category[]> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.category.findMany({ orderBy: { position: "asc" } });
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description ?? "",
      }));
    } catch (error) {
      onDbError("getCategories", error);
    }
  }
  return seedCategories;
}

/** The raw source collections, for the shop's collection filter list. */
export function getCollectionFilters(): CollectionFilter[] {
  return seedCollectionFilters;
}

export function collectionNameForSlug(slug: string): string | undefined {
  return seedCollectionFilters.find((c) => c.slug === slug)?.name;
}

/** The countries products are stocked from, with flags and counts. */
export function getCountryFilters(): CountryFilter[] {
  return seedCountryFilters;
}

export function countryNameForSlug(slug: string): string | undefined {
  return seedCountryFilters.find((c) => c.slug === slug)?.name;
}

export interface ProductQuery {
  categorySlug?: string;
  /** Raw source collection name, e.g. "Marrakesh Spices". */
  collectionName?: string;
  /** Country of origin, e.g. "Morocco". */
  country?: string;
  /** Free-text match across name, brand, tagline, and country. */
  search?: string;
  featuredOnly?: boolean;
  /** "featured" (default curated order) · "name" · "price-asc" · "price-desc". */
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}

export type ProductSort = "featured" | "name" | "price-asc" | "price-desc";

const priceOf = (p: Product) => p.minPriceCents ?? Number.POSITIVE_INFINITY;

function sortProducts(list: Product[], sort: ProductSort | undefined): Product[] {
  switch (sort) {
    case "name":
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    case "price-asc":
      return [...list].sort((a, b) => priceOf(a) - priceOf(b));
    case "price-desc":
      return [...list].sort((a, b) => (b.minPriceCents ?? -1) - (a.minPriceCents ?? -1));
    default:
      return list; // already in the curated featured/position order
  }
}

function prismaOrderBy(sort: ProductSort | undefined) {
  switch (sort) {
    case "name":
      return [{ name: "asc" as const }];
    case "price-asc":
      return [{ minPriceCents: { sort: "asc" as const, nulls: "last" as const } }, { name: "asc" as const }];
    case "price-desc":
      return [{ minPriceCents: { sort: "desc" as const, nulls: "last" as const } }, { name: "asc" as const }];
    default:
      return [{ position: "asc" as const }, { name: "asc" as const }];
  }
}

function prismaWhere(query: ProductQuery) {
  return {
    isActive: true,
    ...(query.categorySlug ? { category: { slug: query.categorySlug } } : {}),
    ...(query.collectionName ? { collections: { has: query.collectionName } } : {}),
    ...(query.country ? { origin: query.country } : {}),
    ...(query.featuredOnly ? { isFeatured: true } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { brand: { contains: query.search, mode: "insensitive" as const } },
            { tagline: { contains: query.search, mode: "insensitive" as const } },
            { origin: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

function sliceSeed(query: ProductQuery): Product[] {
  const filtered = sortProducts(filterSeedProducts(query), query.sort);
  const start = query.offset ?? 0;
  return query.limit != null
    ? filtered.slice(start, start + query.limit)
    : filtered.slice(start);
}

export async function getProducts(query: ProductQuery = {}): Promise<Product[]> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.product.findMany({
        where: prismaWhere(query),
        include: {
          category: true,
          variants: { orderBy: { position: "asc" } },
        },
        orderBy: prismaOrderBy(query.sort),
        ...(query.limit != null ? { take: query.limit } : {}),
        ...(query.offset != null ? { skip: query.offset } : {}),
      });
      return rows.map(toProduct);
    } catch (error) {
      onDbError("getProducts", error);
    }
  }
  return sliceSeed(query);
}

export async function getProductCount(query: ProductQuery = {}): Promise<number> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      return await prisma.product.count({ where: prismaWhere(query) });
    } catch (error) {
      onDbError("getProductCount", error);
    }
  }
  return filterSeedProducts(query).length;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.product.findUnique({
        where: { slug },
        include: {
          category: true,
          variants: { orderBy: { position: "asc" } },
        },
      });
      return row ? toProduct(row) : null;
    } catch (error) {
      onDbError("getProductBySlug", error);
    }
  }
  return seedProducts.find((product) => product.slug === slug) ?? null;
}

export interface PricedVariant {
  variantId: string;
  sku: string;
  variantName: string;
  productName: string;
  unitPriceCents: number | null;
}

/**
 * Authoritative pricing for a set of variant ids. Quote submissions re-price
 * against this rather than trusting the amounts held in the browser. A null
 * price is preserved as null (quote-only line).
 */
export async function getVariantsByIds(
  ids: string[],
): Promise<Map<string, PricedVariant>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, PricedVariant>();
  if (unique.length === 0) return result;

  const prisma = getPrisma();

  if (!prisma) {
    for (const product of seedProducts) {
      for (const variant of product.variants) {
        if (unique.includes(variant.id)) {
          result.set(variant.id, {
            variantId: variant.id,
            sku: variant.sku,
            variantName: variant.name,
            productName: product.name,
            unitPriceCents: variant.retailPriceCents,
          });
        }
      }
    }
    return result;
  }

  try {
    const rows = await prisma.productVariant.findMany({
      where: { id: { in: unique } },
      include: { product: { select: { name: true } } },
    });
    for (const row of rows) {
      result.set(row.id, {
        variantId: row.id,
        sku: row.sku,
        variantName: row.name,
        productName: row.product.name,
        unitPriceCents: row.retailPriceCents,
      });
    }
  } catch (error) {
    // A write path (quote submission) depends on this; surface rather than
    // silently re-pricing against stale fallback data.
    onDbError("getVariantsByIds", error);
    throw error;
  }

  return result;
}

export async function getProductSlugs(): Promise<string[]> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.product.findMany({
        where: { isActive: true },
        select: { slug: true },
      });
      return rows.map((row) => row.slug);
    } catch (error) {
      onDbError("getProductSlugs", error);
    }
  }
  return seedProducts.map((product) => product.slug);
}

function filterSeedProducts(query: ProductQuery): Product[] {
  const needle = query.search?.trim().toLowerCase();

  return seedProducts.filter((product) => {
    if (query.categorySlug && product.categorySlug !== query.categorySlug) {
      return false;
    }
    if (query.collectionName && !product.collections.includes(query.collectionName)) {
      return false;
    }
    if (query.country && product.origin !== query.country) {
      return false;
    }
    if (query.featuredOnly && !product.isFeatured) {
      return false;
    }
    if (needle) {
      const haystack = [
        product.name,
        product.brand,
        product.tagline,
        product.origin,
        product.categoryName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
