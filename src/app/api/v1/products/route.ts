import { apiJson, apiOptions, serializeProduct } from "@/lib/api-response";
import {
  collectionNameForSlug,
  getProductCount,
  getProducts,
  type ProductQuery,
  type ProductSort,
} from "@/lib/catalog";

const SORTS: ProductSort[] = ["featured", "name", "price-asc", "price-desc"];

// GET /api/v1/products — filtered, paginated product list.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;

  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 24) || 24, 1), 100);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const sortParam = sp.get("sort") as ProductSort | null;

  // `collection` accepts a slug or the raw name; resolve slug → name.
  const collectionParam = sp.get("collection") ?? undefined;
  const collectionName = collectionParam
    ? collectionNameForSlug(collectionParam) ?? collectionParam
    : undefined;

  const query: ProductQuery = {
    categorySlug: sp.get("category") ?? undefined,
    country: sp.get("country") ?? undefined,
    collectionName,
    search: sp.get("q") ?? undefined,
    featuredOnly: sp.get("featured") === "true",
    sort: sortParam && SORTS.includes(sortParam) ? sortParam : undefined,
    limit,
    offset,
  };

  const [items, total] = await Promise.all([getProducts(query), getProductCount(query)]);

  return apiJson({
    products: items.map(serializeProduct),
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  });
}

export const OPTIONS = apiOptions;
