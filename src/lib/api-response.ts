import { NextResponse } from "next/server";

import type { Product } from "@/lib/catalog";

/**
 * Helpers for the public read API under /api/v1. Responses are JSON with
 * permissive CORS (read-only public catalog data) and short-lived caching.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function apiJson(data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: { ...CORS, "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}

/** CORS preflight — export as OPTIONS from each route. */
export function apiOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** The public JSON shape of a product (internal fields stripped). */
export function serializeProduct(p: Product) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    origin: p.origin,
    brand: p.brand,
    imageUrl: p.imageUrl,
    ribbon: p.ribbon,
    isFeatured: p.isFeatured,
    category: { slug: p.categorySlug, name: p.categoryName },
    collections: p.collections,
    fromPriceCents: p.minPriceCents ?? null,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      priceCents: v.retailPriceCents,
      inStock: v.inStock,
      unitsPerCase: v.unitsPerCase,
    })),
  };
}
