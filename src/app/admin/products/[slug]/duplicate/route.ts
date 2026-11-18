import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createCustomProduct } from "@/lib/admin/products";
import { getPrisma } from "@/lib/db";

// Duplicate a product into a new hidden (isActive:false) custom copy, then open
// its editor. Full-page POST → 303 (host-safe). The copy is hidden so it never
// appears as a live duplicate until the admin reviews and shows it.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireUser();
  } catch {
    return redirectTo("/admin/login");
  }

  const { slug } = await params;
  const prisma = getPrisma();
  if (!prisma) return redirectTo("/admin/products");

  const src = await prisma.product.findUnique({
    where: { slug },
    include: { category: true, variants: { orderBy: { position: "asc" } } },
  });
  if (!src) return redirectTo("/admin/products");

  const name = `${src.name} (copy)`;
  const newSlug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product-copy";
  const images = src.images?.length ? src.images : src.imageUrl ? [src.imageUrl] : [];
  const primary = src.variants[0];
  const extras = src.variants.slice(1).map((v) => ({ size: v.name, unitsPerCase: v.unitsPerCase, priceCents: v.retailPriceCents }));

  try {
    const created = await createCustomProduct({
      name,
      slug: newSlug,
      sku: `LV-${newSlug}`.toUpperCase().slice(0, 40),
      categorySlug: src.category.slug,
      description: src.description,
      origin: src.origin,
      brand: src.brand,
      barcode: null, // a copy must not share a unique barcode
      ribbon: src.ribbon,
      images,
      priceCents: primary?.retailPriceCents ?? null,
      unitSize: primary?.name ?? null,
      unitsPerCase: primary?.unitsPerCase ?? null,
      isFragile: src.isFragile,
      isActive: false,
      extraVariants: extras,
    });
    return redirectTo(`/admin/products/${created.slug}?dup=1`);
  } catch (error) {
    console.error("[admin] duplicate product failed", error);
    return redirectTo(`/admin/products/${slug}`);
  }
}
