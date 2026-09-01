import { apiJson, apiOptions } from "@/lib/api-response";
import { getCollectionFilters } from "@/lib/catalog";

// GET /api/v1/collections — raw source collections used as shop filters.
export function GET() {
  return apiJson({ collections: getCollectionFilters() });
}

export const OPTIONS = apiOptions;
