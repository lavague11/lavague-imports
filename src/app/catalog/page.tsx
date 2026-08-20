import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { CatalogBuilder } from "@/components/catalog/catalog-builder";
import { Container } from "@/components/ui/container";
import { getCategories, getCountryFilters } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Download our catalog",
  description: "Download a PDF catalog of La Vague Imports — by country, by category, or the whole range.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [categories, countries] = await Promise.all([getCategories(), getCountryFilters()]);
  const empty = (await searchParams).empty === "1";

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">Catalog</p>
        <h1 className="mt-3 text-4xl text-olive-900 sm:text-5xl">Download our catalog</h1>
        <p className="mt-4 text-olive-700">Select the countries and categories you want — or download the whole range.</p>
      </header>

      {/* Whole-catalog quick download */}
      <Link
        href="/catalog/generate"
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-full border border-olive-300 bg-white px-6 text-sm font-medium text-olive-900 hover:border-olive-500 hover:bg-olive-50"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download the full catalog (PDF)
      </Link>

      {empty ? (
        <p className="mt-6 max-w-2xl rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nothing matched that selection. Try fewer filters, or download the full catalog above.
        </p>
      ) : null}

      <div className="mt-12 border-t border-olive-100 pt-10">
        <p className="eyebrow mb-6">Or build your own</p>
        <CatalogBuilder
          countries={countries.map((c) => ({ slug: c.slug, name: c.name, count: c.count }))}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        />
      </div>
    </Container>
  );
}
