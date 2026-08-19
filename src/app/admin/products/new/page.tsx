import Link from "next/link";
import { redirect } from "next/navigation";

import { NewProductForm } from "@/components/admin/new-product-form";
import { getCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { COUNTRY_ISO } from "@/lib/countries";

export default async function AdminNewProduct({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const categories = await getCategories();
  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/products" className="text-sm text-olive-600 hover:underline">
        ← All products
      </Link>
      <h1 className="mt-2 font-display text-2xl text-olive-900">New product</h1>
      <p className="mt-1 mb-6 text-sm text-olive-600">
        Create a product that isn&apos;t in any imported source. It survives catalog re-imports.
      </p>
      <NewProductForm
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        countries={Object.keys(COUNTRY_ISO).sort()}
        errorCode={errorCode}
      />
    </div>
  );
}
