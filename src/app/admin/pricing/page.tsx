import Link from "next/link";
import { redirect } from "next/navigation";

import { PricingRow, type PricingRowData } from "@/components/admin/pricing-row";
import { getCurrentUser } from "@/lib/auth";
import { getCategories, sourceLabel } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import { buildBenchmarks, suggestPrice, type PricedItem } from "@/lib/pricing";

const PAGE_SIZE = 50;
type Filter = "no-price" | "no-cost" | undefined;

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Cheapest priced variant, else the first — the row we price against. */
function primaryVariant<T extends { retailPriceCents: number | null }>(variants: T[]): T | undefined {
  const priced = variants.filter((v) => v.retailPriceCents != null);
  if (priced.length) return priced.reduce((a, b) => (b.retailPriceCents! < a.retailPriceCents! ? b : a));
  return variants[0];
}

export default async function AdminPricing({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected — see the dashboard.</p>;

  const params = await searchParams;
  const filter = firstValue(params.filter) as Filter;
  const category = firstValue(params.category);
  const search = firstValue(params.q)?.trim() ?? "";
  const page = Math.max(1, Number(firstValue(params.page)) || 1);

  // Benchmarks from every priced product (the "market" basis).
  const pricedRows = await prisma.product.findMany({
    where: { minPriceCents: { not: null } },
    select: { category: { select: { slug: true } }, variants: { select: { name: true, retailPriceCents: true }, orderBy: { position: "asc" } } },
  });
  const pricedItems: PricedItem[] = [];
  for (const p of pricedRows) {
    const v = primaryVariant(p.variants);
    if (v?.retailPriceCents != null) pricedItems.push({ categorySlug: p.category.slug, sizeLabel: v.name, priceCents: v.retailPriceCents });
  }
  const benchmarks = buildBenchmarks(pricedItems);

  const where = {
    ...(filter === "no-price" ? { minPriceCents: null } : {}),
    ...(filter === "no-cost" ? { costCents: null } : {}),
    ...(category ? { category: { slug: category } } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [categories, total, rows] = await Promise.all([
    getCategories(),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, variants: { orderBy: { position: "asc" } } },
      orderBy: [{ name: "asc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const data: PricingRowData[] = rows.map((p) => {
    const v = primaryVariant(p.variants);
    const price = v?.retailPriceCents ?? null;
    return {
      slug: p.slug,
      name: p.name,
      sku: v?.sku ?? "",
      size: v?.name ?? "",
      source: sourceLabel(p.source),
      marketCents: price,
      suggestedCents: suggestPrice(p.category.slug, v?.name ?? "", benchmarks),
      priceCents: price,
      costCents: p.costCents ?? null,
    };
  });

  const tabs: { key: string; label: string; href: string; active: boolean }[] = [
    { key: "all", label: "All", href: "/admin/pricing", active: !filter && !category },
    { key: "no-price", label: "No price", href: "/admin/pricing?filter=no-price", active: filter === "no-price" },
    { key: "no-cost", label: "No cost", href: "/admin/pricing?filter=no-cost", active: filter === "no-cost" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-olive-900">Pricing</h1>
          <p className="mt-1 text-sm text-olive-600">
            Market prices come from our scraped sources; suggestions from category
            price-per-unit benchmarks ({benchmarks.sampleCount} priced items). Enter your cost to see profit &amp; margin.
          </p>
        </div>
        <form action="/admin/pricing" className="flex gap-2">
          {filter ? <input type="hidden" name="filter" value={filter} /> : null}
          <input name="q" defaultValue={search} placeholder="Search products…" className="h-10 w-52 rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
          <select name="category" defaultValue={category ?? ""} className="h-10 rounded-lg border border-olive-200 px-3 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
          <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white">Search</button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className={`rounded-full border px-3 py-1.5 text-sm ${t.active ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-sm text-olive-600">
        {total} {total === 1 ? "product" : "products"}{totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-olive-100 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
            <tr>
              <th className="p-2">Product</th>
              <th className="p-2 text-right">Market</th>
              <th className="p-2 text-right">Suggested</th>
              <th className="p-2 text-right">Cost</th>
              <th className="p-2 text-right">Price</th>
              <th className="p-2 text-right">Profit</th>
              <th className="p-2 text-right">Margin</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <PricingRow key={row.slug} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between">
          <PageLink params={params} page={page - 1} disabled={page <= 1}>← Previous</PageLink>
          <span className="text-sm text-olive-600">Page {page} of {totalPages}</span>
          <PageLink params={params} page={page + 1} disabled={page >= totalPages}>Next →</PageLink>
        </div>
      ) : null}
    </div>
  );
}

function PageLink({ params, page, disabled, children }: { params: Record<string, string | string[] | undefined>; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-lg border border-olive-100 px-4 py-2 text-sm text-olive-300">{children}</span>;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page") continue;
    if (typeof v === "string") q.set(k, v);
  }
  q.set("page", String(page));
  return <Link href={`/admin/pricing?${q.toString()}`} className="rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50">{children}</Link>;
}
