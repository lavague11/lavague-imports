import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductEditForm } from "@/components/admin/product-edit-form";
import { getCurrentUser } from "@/lib/auth";
import { getCategories, sourceLabel } from "@/lib/catalog";
import { COUNTRY_ISO } from "@/lib/countries";
import { getPrisma } from "@/lib/db";

export default async function AdminEditProduct({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected — see the dashboard.</p>;

  const { slug } = await params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { slug },
      include: { category: true, variants: { orderBy: { position: "asc" } } },
    }),
    getCategories(),
  ]);
  if (!product) notFound();

  const countries = Object.keys(COUNTRY_ISO).sort();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/admin/products" className="text-sm text-olive-600 hover:underline">
          ← All products
        </Link>
        <Link href={`/shop/${slug}`} target="_blank" className="text-sm text-olive-600 hover:underline">
          View on store ↗
        </Link>
      </div>

      <h1 className="font-display text-2xl text-olive-900">{product.name}</h1>
      <p className="mt-1 text-sm text-olive-500">
        {product.category.name} · sourced from{" "}
        <span className="font-medium text-olive-700">{sourceLabel(product.source)}</span>
        {product.isCustom ? " · custom product" : ""}
      </p>

      <div className="mt-6">
        <ProductEditForm
          product={{
            slug: product.slug,
            name: product.name,
            description: product.description,
            images: product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [],
            origin: product.origin,
            ribbon: product.ribbon,
            isFeatured: product.isFeatured,
            isActive: product.isActive,
            isFragile: product.isFragile,
            categorySlug: product.category.slug,
            variants: product.variants.map((v) => ({
              sku: v.sku,
              name: v.name,
              retailPriceCents: v.retailPriceCents,
              unitsPerCase: v.unitsPerCase,
            })),
          }}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          countries={countries}
        />
      </div>
    </div>
  );
}
