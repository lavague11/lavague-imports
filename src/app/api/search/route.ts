import { NextResponse } from "next/server";

import { getCountryFilters } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";

// Typeahead suggestions for the shop search box: matching product names (link
// straight to the product) and matching countries (filter the shop by origin).
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ products: [], countries: [] });

  interface Variant { id: string; sku: string; name: string; priceCents: number | null; inStock: boolean }
  let products: {
    name: string;
    slug: string;
    imageUrl: string | null;
    priceCents: number | null;
    hasRange: boolean;
    variant: Variant | null;
  }[] = [];
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.product.findMany({
        where: { isActive: true, name: { contains: q, mode: "insensitive" } },
        select: {
          name: true,
          slug: true,
          imageUrl: true,
          variants: {
            select: { id: true, sku: true, name: true, retailPriceCents: true, inStock: true },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { name: "asc" },
        take: 8,
      });
      products = rows.map((r) => {
        // Primary variant = cheapest priced, else the first — matches the "from"
        // price shown and is what the quick "Add" adds to the quote.
        const priced = r.variants.filter((v) => v.retailPriceCents != null);
        const primary =
          (priced.length
            ? priced.reduce((a, b) => (b.retailPriceCents! < a.retailPriceCents! ? b : a))
            : r.variants[0]) ?? null;
        return {
          name: r.name,
          slug: r.slug,
          imageUrl: r.imageUrl,
          priceCents: primary?.retailPriceCents ?? null,
          hasRange: r.variants.length > 1,
          variant: primary
            ? { id: primary.id, sku: primary.sku, name: primary.name, priceCents: primary.retailPriceCents, inStock: primary.inStock }
            : null,
        };
      });
    } catch {
      products = [];
    }
  }

  const needle = q.toLowerCase();
  const countries = (await getCountryFilters())
    .filter((c) => c.name.toLowerCase().includes(needle))
    .slice(0, 4)
    .map((c) => ({ name: c.name, slug: c.slug, count: c.count }));

  return NextResponse.json({ products, countries });
}
