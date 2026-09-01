import { apiError, apiJson, apiOptions, serializeProduct } from "@/lib/api-response";
import { getProductBySlug } from "@/lib/catalog";

// GET /api/v1/products/{slug} — a single product with its variants.
export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const product = await getProductBySlug(slug);
  if (!product) return apiError("product not found", 404);
  return apiJson({ product: serializeProduct(product) });
}

export const OPTIONS = apiOptions;
