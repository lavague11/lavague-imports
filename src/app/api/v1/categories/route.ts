import { apiJson, apiOptions } from "@/lib/api-response";
import { getCategories } from "@/lib/catalog";

// GET /api/v1/categories — the shop departments, in display order.
export async function GET() {
  const categories = await getCategories();
  return apiJson({ categories });
}

export const OPTIONS = apiOptions;
