import catalog from "./catalog.json";
import type { Category, CollectionFilter, Product } from "./types";

/**
 * The catalog is generated from the Wix export by
 * `scripts/import-wix-catalog.mjs` into `catalog.json`. That file is the source
 * of truth for both `prisma/seed.ts` and the fallback the storefront reads from
 * when DATABASE_URL is unset. Re-run the importer to regenerate it.
 */

export const categories: Category[] = catalog.categories;
export const products: Product[] = catalog.products as Product[];
export const collectionFilters: CollectionFilter[] = catalog.collections;
