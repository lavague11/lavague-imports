import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BulkAdd } from "@/components/admin/bulk-add";
import { getCurrentUser } from "@/lib/auth";
import { getBrandNames, getCategories } from "@/lib/catalog";
import { COUNTRY_ISO } from "@/lib/countries";

export const metadata = {
  title: "Bulk add · Admin",
  robots: { index: false, follow: false },
};

export default async function BulkAddPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const [categories, brands] = await Promise.all([getCategories(), getBrandNames()]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" /> All products
      </Link>
      <h1 className="mt-2 font-display text-2xl text-olive-900">Bulk add</h1>
      <p className="mt-1 mb-6 text-sm text-olive-600">
        Drop in many photos — we identify each one, group photos by product, and you review before saving. New products are saved hidden and marked <span className="font-medium">Needs review</span>.
      </p>
      <BulkAdd categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} brands={brands} countries={Object.keys(COUNTRY_ISO).sort()} />
    </div>
  );
}
