import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductForm } from "@/components/admin/product-form";
import { getCurrentUser } from "@/lib/auth";
import { getBrandNames, getCategories, sourceLabel } from "@/lib/catalog";
import { COUNTRY_ISO } from "@/lib/countries";
import { getPrisma } from "@/lib/db";
import { getProductTags, listTypeOptions } from "@/lib/admin/product-tags";

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
  const [tags, typeOptions] = await Promise.all([getProductTags(slug), listTypeOptions()]);
  const [product, categories, brands, override] = await Promise.all([
    prisma.product.findUnique({
      where: { slug },
      include: { category: true, variants: { orderBy: { position: "asc" } } },
    }),
    getCategories(),
    getBrandNames(),
    prisma.productOverride.findUnique({
      where: { slug },
      select: {
        draft: true, draftUpdatedAt: true, imported: true, importSuggests: true,
        name: true, description: true, brand: true, origin: true, ribbon: true, categorySlug: true, isFeatured: true, isFragile: true,
      },
    }),
  ]);
  if (!product) notFound();

  const countries = Object.keys(COUNTRY_ISO).sort();

  // Merge any unpublished draft (§9) over the live product so the form shows the
  // work-in-progress. The store still reads the live (published) product.
  type DraftShape = {
    name?: string; description?: string; brand?: string | null; origin?: string | null; ribbon?: string | null;
    categorySlug?: string; isFeatured?: boolean; isFragile?: boolean;
    variantPrices?: Record<string, number | null>;
    variantPacks?: Record<string, { size?: string | null; unitsPerCase?: number | null }>;
  };
  const draft: DraftShape | null = override?.draft && typeof override.draft === "object" ? (override.draft as DraftShape) : null;
  const hasDraft = !!override?.draftUpdatedAt;
  const pick = <T,>(d: T | undefined, fallback: T): T => (d !== undefined ? d : fallback);
  const mergedVariants = product.variants.map((v) => {
    const pack = draft?.variantPacks?.[v.sku];
    const dp = draft?.variantPrices?.[v.sku];
    return {
      sku: v.sku,
      name: pack?.size ?? v.name,
      retailPriceCents: dp !== undefined ? dp : v.retailPriceCents,
      unitsPerCase: pack?.unitsPerCase ?? v.unitsPerCase,
    };
  });

  // §15 — which fields are hand-edited (locked) and any import suggestions.
  const ovRec = override as Record<string, unknown> | null;
  const imp = (override?.imported ?? {}) as Record<string, unknown>;
  const sug = (override?.importSuggests ?? {}) as Record<string, unknown>;
  const fmtField = (field: string, v: unknown): string => {
    if (v == null) return "";
    if (field === "categorySlug") return categories.find((c) => c.slug === v)?.name ?? String(v);
    if (field === "isFeatured" || field === "isFragile") return v ? "yes" : "no";
    const s = String(v);
    return s.length > 40 ? `${s.slice(0, 40)}…` : s;
  };
  const SCALAR_FIELDS = ["name", "description", "brand", "origin", "ribbon", "categorySlug", "isFeatured", "isFragile"] as const;
  const locks: Record<string, { locked: boolean; imported?: string; suggest?: string }> = {};
  for (const f of SCALAR_FIELDS) {
    // A field is "hand-edited" only when its override value actually differs
    // from the imported source (legacy edits with no snapshot count as locked).
    const locked = ovRec?.[f] != null && (!(f in imp) || JSON.stringify(ovRec[f]) !== JSON.stringify(imp[f]));
    const suggest = f in sug ? fmtField(f, sug[f]) : undefined;
    if (locked || suggest !== undefined) locks[f] = { locked, imported: fmtField(f, imp[f]), suggest };
  }

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
        <ProductForm
          mode="edit"
          hasDraft={hasDraft}
          product={{
            slug: product.slug,
            name: pick(draft?.name, product.name),
            description: pick(draft?.description, product.description),
            brand: pick(draft?.brand, product.brand),
            images: product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [],
            origin: pick(draft?.origin, product.origin),
            ribbon: pick(draft?.ribbon, product.ribbon),
            isFeatured: pick(draft?.isFeatured, product.isFeatured),
            isActive: product.isActive,
            isFragile: pick(draft?.isFragile, product.isFragile),
            availability: product.availability,
            categorySlug: pick(draft?.categorySlug, product.category.slug),
            source: product.source,
            storeUrl: `/shop/${product.slug}`,
            variants: mergedVariants,
          }}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          countries={countries}
          brands={brands}
          locks={Object.keys(locks).length ? locks : undefined}
          tags={tags.map((t) => ({ id: t.id, kind: t.kind, value: t.value, lang: t.lang }))}
          typeOptions={typeOptions}
        />
      </div>
    </div>
  );
}
