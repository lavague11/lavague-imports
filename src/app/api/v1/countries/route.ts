import { apiJson, apiOptions } from "@/lib/api-response";
import { getCountryFilters } from "@/lib/catalog";

// GET /api/v1/countries — origins stocked, with flags and product counts.
export async function GET() {
  const countries = await getCountryFilters();
  return apiJson({ countries });
}

export const OPTIONS = apiOptions;
