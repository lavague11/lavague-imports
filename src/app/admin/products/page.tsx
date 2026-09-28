import Link from "next/link";
import { redirect } from "next/navigation";

import { bulkSetActive } from "@/app/admin/actions";
import { ColumnFilter, type FilterOption } from "@/components/admin/column-filter";
import { ExportMenu } from "@/components/admin/export-menu";
import { FilterDrawer } from "@/components/admin/filter-drawer";
import { VisibilityToggle } from "@/components/admin/visibility-toggle";
import { getCurrentUser } from "@/lib/auth";
import {
  CUSTOM,
  MISSING,
  PAGE_SIZES,
  buildOrderBy,
  buildProductWhere,
  parseProductParams,
  type SortKey,
} from "@/lib/admin/product-query";
import { getCategories, sourceLabel } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import { formatPriceOrRequest } from "@/lib/utils";

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const asList = (v: string | string[] | undefined) =>
  (firstValue(v) || "").split(",").map((s) => s.trim()).filter(Boolean);

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const prisma = getPrisma();
  if (!prisma) {
    return <p className="text-olive-700">Database not connected — see the dashboard.</p>;
  }

  const params = await searchParams;
  // Flatten to plain strings for URL building.
  const cur: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const s = firstValue(v);
    if (s) cur[k] = s;
  }

  const parsed = parseProductParams(params);
  const { q: search, filter, sources, cats, origins, statuses, price, priceMin, priceMax, sortKey, dir, page, pageSize } = parsed;
  const where = await buildProductWhere(prisma, parsed);

  const [categories, sourceGroups, originGroups, customCount, missingOriginCount, total, rows] = await Promise.all([
    getCategories(),
    prisma.product.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.product.groupBy({ by: ["origin"], _count: { _all: true } }),
    prisma.product.count({ where: { isCustom: true } }),
    prisma.product.count({ where: { origin: null } }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, variants: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: buildOrderBy(sortKey, dir),
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ---- funnel options ----
  const sourceOptions: FilterOption[] = [
    ...sourceGroups
      .filter((g) => g.source)
      .map((g) => ({ value: g.source as string, label: sourceLabel(g.source), count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    { value: CUSTOM, label: "Custom / manual", count: customCount },
  ];
  const originOptions: FilterOption[] = [
    ...originGroups
      .filter((g) => g.origin)
      .map((g) => ({ value: g.origin as string, label: g.origin as string, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    ...(missingOriginCount ? [{ value: MISSING, label: "Unknown / missing", count: missingOriginCount }] : []),
  ];
  const categoryOptions: FilterOption[] = categories.map((c) => ({ value: c.slug, label: c.name }));
  const statusOptions: FilterOption[] = [
    { value: "visible", label: "Visible" },
    { value: "hidden", label: "Hidden" },
    { value: "retail", label: "Retail channel" },
    { value: "wholesale", label: "Wholesale channel" },
  ];

  // ---- active filter chips ----
  const labelFor = (list: FilterOption[], v: string) => list.find((o) => o.value === v)?.label ?? v;
  const chips: { key: string; label: string; href: string }[] = [];
  const removeHref = (param: string, value?: string) => {
    const p = new URLSearchParams(cur);
    if (value) {
      const rest = asList(cur[param]).filter((x) => x !== value);
      if (rest.length) p.set(param, rest.join(","));
      else p.delete(param);
    } else {
      p.delete(param);
    }
    p.delete("page");
    return `/admin/products?${p.toString()}`;
  };
  for (const s of sources) chips.push({ key: `source:${s}`, label: labelFor(sourceOptions, s), href: removeHref("source", s) });
  for (const c of cats) chips.push({ key: `cat:${c}`, label: labelFor(categoryOptions, c), href: removeHref("category", c) });
  for (const o of origins) chips.push({ key: `origin:${o}`, label: labelFor(originOptions, o), href: removeHref("origin", o) });
  for (const s of statuses) chips.push({ key: `status:${s}`, label: labelFor(statusOptions, s), href: removeHref("status", s) });
  if (price === "has") chips.push({ key: "price", label: "Has a price", href: removeHref("price") });
  else if (price === "request") chips.push({ key: "price", label: "Price on request", href: removeHref("price") });
  else if (price === "range") {
    const lbl = `$${priceMin || 0}–${priceMax ? `$${priceMax}` : "∞"}`;
    chips.push({ key: "price", label: lbl, href: `/admin/products?${(() => { const p = new URLSearchParams(cur); p.delete("price"); p.delete("priceMin"); p.delete("priceMax"); p.delete("page"); return p.toString(); })()}` });
  }
  const clearAllHref = (() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    return `/admin/products${p.toString() ? `?${p}` : ""}`;
  })();

  const tabs = [
    { key: "all", label: "All", filter: "" },
    { key: "missing-image", label: "Missing image", filter: "missing-image" },
    { key: "no-description", label: "No description", filter: "no-description" },
    { key: "hidden", label: "Hidden", filter: "hidden" },
    { key: "custom", label: "Custom", filter: "custom" },
  ];
  const tabHref = (f: string) => {
    const p = new URLSearchParams(cur);
    if (f) p.set("filter", f);
    else p.delete("filter");
    p.delete("page");
    return `/admin/products?${p.toString()}`;
  };

  // Sortable header link — preserves all current params.
  const sortLink = (label: string, col: SortKey) => {
    const nextDir = sortKey === col && dir === "asc" ? "desc" : "asc";
    const p = new URLSearchParams(cur);
    p.set("sort", col);
    p.set("dir", nextDir);
    const active = sortKey === col;
    return (
      <Link href={`/admin/products?${p.toString()}`} className={`inline-flex items-center gap-0.5 hover:text-olive-900 ${active ? "font-semibold text-olive-900" : ""}`}>
        {label}
        <span className="text-olive-400">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </Link>
    );
  };

  const sizeHref = (size: number) => {
    const p = new URLSearchParams(cur);
    p.set("pageSize", String(size));
    p.delete("page");
    return `/admin/products?${p.toString()}`;
  };

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl text-olive-900">Products</h1>
          <Link href="/admin/products/new" className="rounded-lg bg-olive-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-olive-800">
            + New Product
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search preserves all active filters/sort via hidden inputs. */}
          <form action="/admin/products" className="flex gap-2">
            {Object.entries(cur)
              .filter(([k]) => k !== "q" && k !== "page")
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input name="q" defaultValue={search} placeholder="Search products…" className="h-10 w-44 rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none sm:w-56" />
            <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white">Search</button>
          </form>
          <FilterDrawer
            sourceOptions={sourceOptions}
            categoryOptions={categoryOptions}
            originOptions={originOptions}
            statusOptions={statusOptions}
          />
          <ExportMenu />
        </div>
      </div>

      {/* Quick content chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const active = (t.filter || "") === (filter || "");
          return (
            <Link key={t.key} href={tabHref(t.filter)} className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Active filter chips */}
      {chips.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Link key={c.key} href={c.href} className="inline-flex items-center gap-1 rounded-full bg-olive-100 px-2.5 py-1 text-xs font-medium text-olive-800 hover:bg-olive-200">
              {c.label}
              <span aria-hidden className="text-olive-500">×</span>
            </Link>
          ))}
          <Link href={clearAllHref} className="text-xs font-medium text-olive-500 underline underline-offset-2 hover:text-olive-800">
            Clear all
          </Link>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-olive-600">
        {total === 0 ? "No products match" : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </p>

      <form id="bulk" action={bulkSetActive} className="mt-3 mb-2 flex items-center gap-2 text-sm">
        <span className="text-olive-600">With selected:</span>
        <button name="action" value="show" className="rounded-md border border-olive-300 px-3 py-1 hover:bg-olive-50">Show</button>
        <button name="action" value="hide" className="rounded-md border border-olive-300 px-3 py-1 hover:bg-olive-50">Hide</button>
      </form>

      {total === 0 ? (
        <div className="rounded-xl border border-olive-100 bg-white p-10 text-center">
          <p className="text-olive-700">No products match these filters.</p>
          <Link href={clearAllHref} className="mt-3 inline-block rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-olive-100 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
              <tr>
                <th className="w-8 p-3"></th>
                <th className="w-16 p-3">Image</th>
                <th className="p-3">{sortLink("Product", "name")}</th>
                <th className="p-3">{sortLink("Source", "source")}<ColumnFilter kind="multi" param="source" label="Source" options={sourceOptions} searchable /></th>
                <th className="p-3">{sortLink("Category", "category")}<ColumnFilter kind="multi" param="category" label="Category" options={categoryOptions} searchable /></th>
                <th className="p-3">{sortLink("Origin", "origin")}<ColumnFilter kind="multi" param="origin" label="Origin" options={originOptions} searchable /></th>
                <th className="p-3">{sortLink("Price", "price")}<ColumnFilter kind="price" label="Price" /></th>
                <th className="p-3">{sortLink("Status", "status")}<ColumnFilter kind="multi" param="status" label="Status" options={statusOptions} /></th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const price = p.variants[0]?.retailPriceCents ?? p.minPriceCents ?? null;
                return (
                  <tr key={p.id} className="border-b border-olive-50 last:border-0">
                    <td className="p-3">
                      <input type="checkbox" name="slug" value={p.slug} form="bulk" className="h-4 w-4 accent-olive-800" />
                    </td>
                    <td className="p-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-10 w-10 rounded object-contain" />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded bg-amber-50 text-[10px] font-medium text-amber-700">none</span>
                      )}
                    </td>
                    <td className="max-w-xs p-3">
                      <Link href={`/admin/products/${p.slug}`} className="font-medium text-olive-900 hover:underline">{p.name}</Link>
                      {p.isCustom ? <span className="ml-2 rounded bg-olive-100 px-1.5 py-0.5 text-[10px] text-olive-700">custom</span> : null}
                      {p.isFragile ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">fragile</span> : null}
                    </td>
                    <td className="p-3"><span className="rounded bg-olive-50 px-2 py-0.5 text-xs text-olive-600">{sourceLabel(p.source)}</span></td>
                    <td className="p-3 text-olive-600">{p.category.name}</td>
                    <td className="p-3 text-olive-600">{p.origin ?? "—"}</td>
                    <td className="p-3 text-olive-700">{formatPriceOrRequest(price)}</td>
                    <td className="p-3"><VisibilityToggle slug={p.slug} active={p.isActive} /></td>
                    <td className="p-3 text-right"><Link href={`/admin/products/${p.slug}`} className="text-olive-700 hover:underline">Edit</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination + page-size */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-olive-600">
          Rows:
          {PAGE_SIZES.map((s) => (
            <Link key={s} href={sizeHref(s)} className={`rounded px-1.5 py-0.5 ${s === pageSize ? "bg-olive-900 text-white" : "hover:bg-olive-100"}`}>
              {s}
            </Link>
          ))}
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center gap-4">
            <PageLink cur={cur} page={page - 1} disabled={page <= 1}>← Previous</PageLink>
            <span className="text-sm text-olive-600">Page {page} of {totalPages}</span>
            <PageLink cur={cur} page={page + 1} disabled={page >= totalPages}>Next →</PageLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PageLink({
  cur,
  page,
  disabled,
  children,
}: {
  cur: Record<string, string>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="rounded-lg border border-olive-100 px-4 py-2 text-sm text-olive-300">{children}</span>;
  }
  const p = new URLSearchParams(cur);
  p.set("page", String(page));
  return (
    <Link href={`/admin/products?${p.toString()}`} className="rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50">
      {children}
    </Link>
  );
}
