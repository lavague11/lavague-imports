import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import { buildBenchmarks, suggestPrice, type PricedItem } from "@/lib/pricing";

const PAGE_SIZE = 50;
type Tab = "all" | "high" | "low" | "has-comps";
const SOURCES = ["amazon", "walmart", "ebay", "specialty"] as const;
type Source = (typeof SOURCES)[number];

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const money = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function primaryVariant<T extends { retailPriceCents: number | null }>(vs: T[]): T | undefined {
  const priced = vs.filter((v) => v.retailPriceCents != null);
  return priced.length ? priced.reduce((a, b) => (b.retailPriceCents! < a.retailPriceCents! ? b : a)) : vs[0];
}

export default async function AdminPriceCompare({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected — see the dashboard.</p>;

  const params = await searchParams;
  const tab = (firstValue(params.tab) as Tab) || "all";
  const category = firstValue(params.category);
  const search = firstValue(params.q)?.trim().toLowerCase() ?? "";
  const page = Math.max(1, Number(firstValue(params.page)) || 1);

  const [categories, comps, priced] = await Promise.all([
    getCategories(),
    prisma.priceComparison.findMany(),
    prisma.product.findMany({
      where: { minPriceCents: { not: null }, isActive: true },
      select: {
        slug: true,
        name: true,
        minPriceCents: true,
        category: { select: { slug: true, name: true } },
        variants: { select: { name: true, retailPriceCents: true }, orderBy: { position: "asc" } },
      },
    }),
  ]);

  // Competitor prices grouped by slug → source → lowest price.
  const compMap = new Map<string, Partial<Record<Source, number>>>();
  for (const r of comps) {
    const g = compMap.get(r.productSlug) ?? {};
    const src = (SOURCES as readonly string[]).includes(r.source) ? (r.source as Source) : "specialty";
    if (g[src] == null || r.priceCents < g[src]!) g[src] = r.priceCents;
    compMap.set(r.productSlug, g);
  }

  const benchmarks = buildBenchmarks(
    priced
      .map((p): PricedItem | null => {
        const v = primaryVariant(p.variants);
        return v?.retailPriceCents != null ? { categorySlug: p.category.slug, sizeLabel: v.name, priceCents: v.retailPriceCents } : null;
      })
      .filter((x): x is PricedItem => x !== null),
  );

  type Row = {
    slug: string; name: string; categorySlug: string; our: number;
    comps: Partial<Record<Source, number>>; refCents: number | null; refKind: "market" | "benchmark" | null;
    status: "high" | "low" | "ok" | "unknown";
  };

  const rows: Row[] = priced.map((p) => {
    const v = primaryVariant(p.variants);
    const our = p.minPriceCents!;
    const c = compMap.get(p.slug) ?? {};
    const compVals = SOURCES.map((s) => c[s]).filter((x): x is number => x != null);
    let refCents: number | null = null;
    let refKind: Row["refKind"] = null;
    if (compVals.length) { refCents = median(compVals); refKind = "market"; }
    else { refCents = suggestPrice(p.category.slug, v?.name ?? "", benchmarks); refKind = refCents != null ? "benchmark" : null; }
    let status: Row["status"] = "unknown";
    if (refCents && refCents > 0) {
      const ratio = our / refCents;
      status = ratio > 1.2 ? "high" : ratio < 0.8 ? "low" : "ok";
    }
    return { slug: p.slug, name: p.name, categorySlug: p.category.slug, our, comps: c, refCents, refKind, status };
  });

  const counts = {
    high: rows.filter((r) => r.status === "high").length,
    low: rows.filter((r) => r.status === "low").length,
    comps: rows.filter((r) => Object.keys(r.comps).length > 0).length,
  };

  let filtered = rows;
  if (tab === "high") filtered = filtered.filter((r) => r.status === "high");
  else if (tab === "low") filtered = filtered.filter((r) => r.status === "low");
  else if (tab === "has-comps") filtered = filtered.filter((r) => Object.keys(r.comps).length > 0);
  if (category) filtered = filtered.filter((r) => r.categorySlug === category);
  if (search) filtered = filtered.filter((r) => r.name.toLowerCase().includes(search));

  // Sort worst offenders first (largest deviation from reference).
  const dev = (r: Row) => (r.refCents ? Math.abs(r.our / r.refCents - 1) : 0);
  filtered = [...filtered].sort((a, b) => dev(b) - dev(a));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All priced" },
    { key: "high", label: `Too high (${counts.high})` },
    { key: "low", label: `Too low (${counts.low})` },
    { key: "has-comps", label: `Has comps (${counts.comps})` },
  ];
  const hrefFor = (t: Tab) => {
    const q = new URLSearchParams();
    if (t !== "all") q.set("tab", t);
    if (category) q.set("category", category);
    if (search) q.set("q", search);
    return `/admin/price-compare${q.toString() ? `?${q}` : ""}`;
  };

  const badge = (s: Row["status"]) =>
    s === "high"
      ? "bg-red-100 text-red-700"
      : s === "low"
        ? "bg-amber-100 text-amber-800"
        : s === "ok"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-olive-100 text-olive-500";
  const label = (s: Row["status"]) => (s === "high" ? "Too high" : s === "low" ? "Too low" : s === "ok" ? "In range" : "—");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-olive-900">Price comparison</h1>
          <p className="mt-1 max-w-2xl text-sm text-olive-600">
            Your price vs. Amazon / Walmart / eBay (researched) or the category benchmark. Flags items
            more than 20% above (too high) or below (too low) the market reference.
          </p>
        </div>
        <form action="/admin/price-compare" className="flex gap-2">
          {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
          <input name="q" defaultValue={search} placeholder="Search…" className="h-10 w-48 rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
          <select name="category" defaultValue={category ?? ""} className="h-10 rounded-lg border border-olive-200 px-3 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white">Search</button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={hrefFor(t.key)} className={`rounded-full border px-3 py-1.5 text-sm ${tab === t.key ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-sm text-olive-600">{total} products{totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}</p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-olive-100 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
            <tr>
              <th className="p-2">Product</th>
              <th className="p-2 text-right">Your price</th>
              <th className="p-2 text-right">Amazon</th>
              <th className="p-2 text-right">Walmart</th>
              <th className="p-2 text-right">eBay</th>
              <th className="p-2 text-right">Specialty</th>
              <th className="p-2 text-right">Market ref</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.slug} className="border-b border-olive-50 last:border-0">
                <td className="max-w-[18rem] p-2">
                  <Link href={`/admin/pricing?q=${encodeURIComponent(r.name)}`} className="truncate font-medium text-olive-900 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="p-2 text-right font-medium text-olive-900">{money(r.our)}</td>
                <td className="p-2 text-right text-olive-600">{money(r.comps.amazon)}</td>
                <td className="p-2 text-right text-olive-600">{money(r.comps.walmart)}</td>
                <td className="p-2 text-right text-olive-600">{money(r.comps.ebay)}</td>
                <td className="p-2 text-right text-olive-600">{money(r.comps.specialty)}</td>
                <td className="p-2 text-right text-olive-700">
                  {money(r.refCents)}
                  {r.refKind === "benchmark" ? <span className="ml-1 text-[10px] text-olive-400">cat</span> : null}
                </td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(r.status)}`}>{label(r.status)}</span>
                </td>
              </tr>
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

      <p className="mt-4 text-xs text-olive-500">
        “cat” = compared to the category average (no competitor prices researched yet). Ask to run a research
        pass on a category to fill in real Amazon / Walmart / eBay prices.
      </p>
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
  return <Link href={`/admin/price-compare?${q.toString()}`} className="rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50">{children}</Link>;
}
