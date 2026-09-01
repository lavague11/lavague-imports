import { apiJson, apiOptions } from "@/lib/api-response";
import { siteUrl } from "@/lib/integrations";

// API index — lists the available read endpoints.
export function GET() {
  const base = `${siteUrl()}/api/v1`;
  return apiJson({
    name: "La Vague Imports Catalog API",
    version: "1",
    description: "Read-only access to the product catalog. Public data; CORS-enabled.",
    endpoints: {
      products: {
        url: `${base}/products`,
        method: "GET",
        query: {
          category: "category slug, e.g. oils-ghee",
          country: "origin, e.g. Morocco",
          collection: "raw collection name",
          q: "free-text search",
          sort: "featured | name | price-asc | price-desc",
          limit: "page size (default 24, max 100)",
          offset: "pagination offset",
          featured: "true to only return featured products",
        },
      },
      product: { url: `${base}/products/{slug}`, method: "GET" },
      categories: { url: `${base}/categories`, method: "GET" },
      countries: { url: `${base}/countries`, method: "GET" },
      collections: { url: `${base}/collections`, method: "GET" },
    },
  });
}

export const OPTIONS = apiOptions;
