import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { CountrySelect } from "@/components/catalog/country-select";
import { ParamSelect } from "@/components/catalog/param-select";
import { ProductCard } from "@/components/catalog/product-card";
import { ShowMore } from "@/components/catalog/show-more";
import { SortSelect } from "@/components/catalog/sort-select";
import { Container } from "@/components/ui/container";
import { Flag } from "@/components/ui/flag";
import {
  collectionNameForSlug,
  countryNameForSlug,
  getCategories,
  getCollectionFilters,
  getCountryFilters,
  getProductCount,
  getProducts,
  type ProductSort,
} from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Moroccan olive oil, olives, spices, teas, and North African specialties — imported direct for retail and wholesale.",
};

const PAGE_SIZE = 24;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = await searchParams;
  const activeCategory = firstValue(params.category);
  const activeCollectionSlug = firstValue(params.collection);
  const activeCountrySlug = firstValue(params.country);
  const search = firstValue(params.q)?.trim() ?? "";
  const sortParam = firstValue(params.sort);
  const sort = (["name", "price-asc", "price-desc"].includes(sortParam ?? "")
    ? sortParam
    : "featured") as ProductSort;
  // Progressive "Show more": `show` is how many products to render so far.
  const show = Math.max(
    PAGE_SIZE,
    Math.ceil((Number(firstValue(params.show)) || PAGE_SIZE) / PAGE_SIZE) * PAGE_SIZE,
  );

  const collectionName = activeCollectionSlug
    ? collectionNameForSlug(activeCollectionSlug)
    : undefined;
  const countryName = activeCountrySlug
    ? countryNameForSlug(activeCountrySlug)
    : undefined;

  const query = {
    categorySlug: activeCategory,
    collectionName,
    country: countryName,
    search: search || undefined,
    sort,
  };

  const [categories, collectionFilters, countryFilters, total, products] =
    await Promise.all([
      getCategories(),
      Promise.resolve(getCollectionFilters()),
      Promise.resolve(getCountryFilters()),
      getProductCount(query),
      getProducts({ ...query, limit: show, offset: 0 }),
    ]);

  const activeCategoryName = categories.find(
    (category) => category.slug === activeCategory,
  )?.name;
  const shownCount = products.length;
  const remaining = total - shownCount;

  // Header title: lead with the country (and its flag) when one is filtered.
  const headerTitle = countryName
    ? activeCategoryName
      ? `${activeCategoryName} from ${countryName}`
      : countryName
    : (activeCategoryName ?? "Shop all");

  // Build hrefs that preserve the other active filters.
  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      category: activeCategory,
      collection: activeCollectionSlug,
      country: activeCountrySlug,
      q: search || undefined,
      sort: sort !== "featured" ? sort : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">{countryName ? "Foods of the world" : "The range"}</p>
        <h1 className="mt-3 flex items-center gap-3 text-4xl text-olive-900 sm:text-5xl">
          {countryName ? <Flag country={countryName} className="w-10 sm:w-12" /> : null}
          <span>{headerTitle}</span>
        </h1>
        <p className="mt-4 leading-relaxed text-olive-700">
          Most of our range is sold wholesale and quoted to order. Add what you
          need to your quote list and we&apos;ll come back with pricing, case
          packs, and freight — usually the same business day.
        </p>
      </header>

      <div className="mt-10 lg:grid lg:grid-cols-[210px_1fr] lg:gap-10">
        {/* Departments — sidebar on desktop */}
        <aside className="hidden lg:block">
          <nav
            aria-label="Departments"
            className="scrollbar-none sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-4"
          >
            <p className="eyebrow mb-3">Departments</p>
            <ul className="space-y-0.5">
              <li>
                <DeptLink
                  href={hrefWith({ category: undefined, show: undefined })}
                  isActive={!activeCategory}
                >
                  All products
                </DeptLink>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <DeptLink
                    href={hrefWith({ category: category.slug, show: undefined })}
                    isActive={activeCategory === category.slug}
                  >
                    {category.name}
                  </DeptLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0">
          {/* Departments — horizontal strip on mobile/tablet */}
          <nav
            aria-label="Departments"
            className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 lg:hidden"
          >
            <CategoryPill
              href={hrefWith({ category: undefined, show: undefined })}
              isActive={!activeCategory}
            >
              All
            </CategoryPill>
            {categories.map((category) => (
              <CategoryPill
                key={category.id}
                href={hrefWith({ category: category.slug, show: undefined })}
                isActive={activeCategory === category.slug}
              >
                {category.name}
              </CategoryPill>
            ))}
          </nav>

          {/* Search (with country + sort preserved) */}
          <form action="/shop" className="relative mt-4 lg:mt-0">
            {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
            {activeCountrySlug ? <input type="hidden" name="country" value={activeCountrySlug} /> : null}
            {activeCollectionSlug ? <input type="hidden" name="collection" value={activeCollectionSlug} /> : null}
            {sort !== "featured" ? <input type="hidden" name="sort" value={sort} /> : null}
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
            <label className="sr-only" htmlFor="q">Search by product or country</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Search by product or country — e.g. harissa, Morocco…"
              className="h-11 w-full rounded-full border border-olive-200 pr-20 pl-9 text-sm text-olive-900 placeholder:text-olive-400 focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
            />
            <button type="submit" className="absolute top-1/2 right-1.5 h-8 -translate-y-1/2 rounded-full bg-olive-900 px-4 text-xs font-medium text-white hover:bg-olive-800">
              Search
            </button>
          </form>

          {/* Country · collection · sort — all apply instantly on change */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CountrySelect selected={countryName ?? null} countries={countryFilters} />
            <ParamSelect
              param="collection"
              value={activeCollectionSlug ?? ""}
              placeholder="All collections"
              options={collectionFilters.map((c) => ({ value: c.slug, label: `${c.name} (${c.count})` }))}
            />
            <SortSelect value={sort} />
          </div>

          {/* Active filter chips */}
          {countryName || collectionName ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-olive-700">
              {countryName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-olive-100 px-3 py-1 font-medium text-olive-800">
                  <Flag country={countryName} className="w-4" />
                  {countryName}
                  <Link
                    href={hrefWith({ country: undefined, show: undefined })}
                    aria-label="Clear country filter"
                    className="text-olive-500 hover:text-olive-900"
                  >
                    ✕
                  </Link>
                </span>
              ) : null}
              {collectionName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-olive-100 px-3 py-1 font-medium text-olive-800">
                  {collectionName}
                  <Link
                    href={hrefWith({ collection: undefined, show: undefined })}
                    aria-label="Clear collection filter"
                    className="text-olive-500 hover:text-olive-900"
                  >
                    ✕
                  </Link>
                </span>
              ) : null}
            </div>
          ) : null}

          {products.length === 0 ? (
            <div className="py-20 text-center">
              <h2 className="text-2xl text-olive-900">Nothing matched that</h2>
              <p className="mt-3 text-olive-600">
                Try a different search, or{" "}
                <Link href="/shop" className="underline hover:text-olive-900">
                  browse everything we carry
                </Link>
                . If you&apos;re after something we don&apos;t list, ask us — we
                source to order for trade accounts.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-6 text-sm text-olive-600" aria-live="polite">
                Showing {shownCount} of {total}
                {total === 1 ? " product" : " products"}
                {search ? ` matching “${search}”` : ""}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {remaining > 0 ? (
                <ShowMore
                  nextCount={shownCount + PAGE_SIZE}
                  remaining={remaining}
                  pageSize={PAGE_SIZE}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </Container>
  );
}

function DeptLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "block rounded-lg px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-olive-900 font-medium text-white"
          : "text-olive-700 hover:bg-olive-50 hover:text-olive-900",
      )}
    >
      {children}
    </Link>
  );
}

function CategoryPill({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        isActive
          ? "border-olive-900 bg-olive-900 text-white"
          : "border-olive-200 text-olive-700 hover:border-olive-400 hover:bg-olive-50",
      )}
    >
      {children}
    </Link>
  );
}
