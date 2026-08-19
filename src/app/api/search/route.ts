import { NextResponse } from "next/server";

import { getCountryFilters } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";

// Typeahead suggestions for the shop search box: matching product names (link
// straight to the product) and matching countries (filter the shop by origin).
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ products: [], countries: [] });

  let products: {
    name: string;
    slug: string;
    imageUrl: string | null;
    priceCents: number | null;
    hasRange: boolean;
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
          minPriceCents: true,
          _count: { select: { variants: true } },
        },
        orderBy: { name: "asc" },
        take: 8,
      });
      products = rows.map((r) => ({
        name: r.name,
        slug: r.slug,
        imageUrl: r.imageUrl,
        priceCents: r.minPriceCents,
        hasRange: r._count.variants > 1,
      }));
    } catch {
      products = [];
    }
  }

  const needle = q.toLowerCase();
  const countries = getCountryFilters()
    .filter((c) => c.name.toLowerCase().includes(needle))
    .slice(0, 4)
    .map((c) => ({ name: c.name, slug: c.slug, count: c.count }));

  return NextResponse.json({ products, countries });
}
