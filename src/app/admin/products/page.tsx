import Link from "next/link";
import { redirect } from "next/navigation";

import { bulkSetActive } from "@/app/admin/actions";
import { getCurrentUser } from "@/lib/auth";
import { getCategories, sourceLabel } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import { formatPriceOrRequest } from "@/lib/utils";

const PAGE_SIZE = 50;
type Filter = "missing-image" | "hidden" | "custom" | undefined;

function firstValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

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
  const filter = firstValue(params.filter) as Filter;
  const category = firstValue(params.category);
  const search = firstValue(params.q)?.trim() ?? "";
  const page = Math.max(1, Number(firstValue(params.page)) || 1);

  const where = {
    ...(filter === "missing-image" ? { imageUrl: null } : {}),
    ...(filter === "hidden" ? { isActive: false } : {}),
    ...(filter === "custom" ? { isCustom: true } : {}),
    ...(category ? { category: { slug: category } } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [categories, total, rows] = await Promise.all([
    getCategories(),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, variants: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs: { key: string; label: string; href: string; active: boolean }[] = [
    { key: "all", label: "All", href: "/admin/products", active: !filter && !category },
    { key: "missing-image", label: "Missing image", href: "/admin/products?filter=missing-image", active: filter === "missing-image" },
    { key: "hidden", label: "Hidden", href: "/admin/products?filter=hidden", active: filter === "hidden" },
    { key: "custom", label: "Custom", href: "/admin/products?filter=custom", active: filter === "custom" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl text-olive-900">Products</h1>
        <form action="/admin/products" className="flex gap-2">
          {filter ? <input type="hidden" name="filter" value={filter} /> : null}
          <input
            name="q"
            defaultValue={search}
            placeholder="Search products…"
            className="h-10 w-56 rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none"
          />
          <select
            name="category"
            defaultValue={category ?? ""}
            className="h-10 rounded-lg border border-olive-200 px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white">Search</button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              t.active ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-sm text-olive-600">
        {total} {total === 1 ? "product" : "products"}
        {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
      </p>

      <form action={bulkSetActive} className="mt-3">
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="text-olive-600">With selected:</span>
          <button name="action" value="show" className="rounded-md border border-olive-300 px-3 py-1 hover:bg-olive-50">
            Show
          </button>
          <button name="action" value="hide" className="rounded-md border border-olive-300 px-3 py-1 hover:bg-olive-50">
            Hide
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-olive-100 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
              <tr>
                <th className="w-8 p-3"></th>
                <th className="w-16 p-3">Image</th>
                <th className="p-3">Product</th>
                <th className="p-3">Source</th>
                <th className="p-3">Category</th>
                <th className="p-3">Origin</th>
                <th className="p-3">Price</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const price = p.variants[0]?.retailPriceCents ?? null;
                return (
                  <tr key={p.id} className="border-b border-olive-50 last:border-0">
                    <td className="p-3">
                      <input type="checkbox" name="slug" value={p.slug} className="h-4 w-4 accent-olive-800" />
                    </td>
                    <td className="p-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-10 w-10 rounded object-contain" />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded bg-amber-50 text-[10px] font-medium text-amber-700">
                          none
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs p-3">
                      <Link href={`/admin/products/${p.slug}`} className="font-medium text-olive-900 hover:underline">
                        {p.name}
                      </Link>
                      {p.isCustom ? <span className="ml-2 rounded bg-olive-100 px-1.5 py-0.5 text-[10px] text-olive-700">custom</span> : null}
                    </td>
                    <td className="p-3">
                      <span className="rounded bg-olive-50 px-2 py-0.5 text-xs text-olive-600">
                        {sourceLabel(p.source)}
                      </span>
                    </td>
                    <td className="p-3 text-olive-600">{p.category.name}</td>
                    <td className="p-3 text-olive-600">{p.origin ?? "—"}</td>
                    <td className="p-3 text-olive-700">{formatPriceOrRequest(price)}</td>
                    <td className="p-3">
                      {p.isActive ? (
                        <span className="text-emerald-700">Visible</span>
                      ) : (
                        <span className="text-olive-400">Hidden</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/admin/products/${p.slug}`} className="text-olive-700 hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </form>

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between">
          <PageLink params={params} page={page - 1} disabled={page <= 1}>
            ← Previous
          </PageLink>
          <span className="text-sm text-olive-600">
            Page {page} of {totalPages}
          </span>
          <PageLink params={params} page={page + 1} disabled={page >= totalPages}>
            Next →
          </PageLink>
        </div>
      ) : null}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="rounded-lg border border-olive-100 px-4 py-2 text-sm text-olive-300">{children}</span>;
  }
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page") continue;
    if (typeof v === "string") q.set(k, v);
  }
  q.set("page", String(page));
  return (
    <Link href={`/admin/products?${q.toString()}`} className="rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50">
      {children}
    </Link>
  );
}
