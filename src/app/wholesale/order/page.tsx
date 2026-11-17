import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ReorderGrid, type ReorderItem } from "@/components/wholesale/reorder-grid";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { cartCount, readWholesaleCart } from "@/lib/wholesale-cart";

export const metadata = {
  title: "Order request — wholesale line sheet",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function WholesaleOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/wholesale/order");
  if (customer.role !== "WHOLESALE") redirect("/account");

  const prisma = getPrisma();
  if (!prisma) {
    return (
      <Container className="py-16 text-center text-olive-700">
        Ordering is briefly unavailable — please try again shortly.
      </Container>
    );
  }

  const params = await searchParams;
  const q = (firstValue(params.q) || "").trim();
  const country = (firstValue(params.country) || "").trim();
  const cart = await readWholesaleCart();

  // Reorder grid — products from the customer's past order requests, most-recent
  // then most-frequent first, plus a couple of secondary suggestions.
  const pastLines = await prisma.orderRequestLine.findMany({
    where: { request: { customerId: customer.id }, slug: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { slug: true, cases: true, createdAt: true },
  });
  const stat = new Map<string, { lastQty: number; lastAt: number; freq: number }>();
  for (const l of pastLines) {
    if (!l.slug) continue;
    const s = stat.get(l.slug);
    if (!s) stat.set(l.slug, { lastQty: l.cases, lastAt: l.createdAt.getTime(), freq: 1 });
    else s.freq += 1; // the most-recent row is seen first (desc), so lastQty/lastAt stay
  }
  const pastSlugs = [...stat.keys()];

  let reorderItems: ReorderItem[] = [];
  if (pastSlugs.length) {
    const prods = await prisma.product.findMany({
      where: { slug: { in: pastSlugs }, isActive: true, wholesaleEnabled: true },
      include: { variants: { orderBy: { position: "asc" }, take: 1 } },
    });
    const toItem = (p: (typeof prods)[number], lastQty: number, suggested: boolean): ReorderItem => {
      const v = p.variants[0];
      const pack = v?.unitsPerCase ?? p.casePack ?? null;
      return {
        slug: p.slug,
        name: p.name,
        size: [v?.name ?? null, pack ? `${pack}/case` : null].filter(Boolean).join(" · "),
        imageUrl: p.imageUrl,
        lastQty,
        suggested,
      };
    };
    const bySlug = new Map(prods.map((p) => [p.slug, p]));
    reorderItems = pastSlugs
      .filter((s) => bySlug.has(s))
      .sort((a, b) => stat.get(b)!.lastAt - stat.get(a)!.lastAt || stat.get(b)!.freq - stat.get(a)!.freq)
      .map((s) => toItem(bySlug.get(s)!, stat.get(s)!.lastQty, false))
      .slice(0, 100);

    if (reorderItems.length) {
      const suggestions = await prisma.product.findMany({
        where: { isActive: true, wholesaleEnabled: true, slug: { notIn: pastSlugs } },
        include: { variants: { orderBy: { position: "asc" }, take: 1 } },
        orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
        take: 4,
      });
      reorderItems.push(...suggestions.map((p) => toItem(p, 1, true)));
    }
  }

  const where = {
    isActive: true,
    wholesaleEnabled: true,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(country ? { origin: country } : {}),
  };
  const [products, total, originRows] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: { name: "asc" },
      take: 60,
    }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where: { isActive: true, wholesaleEnabled: true, origin: { not: null } },
      select: { origin: true },
      distinct: ["origin"],
      orderBy: { origin: "asc" },
    }),
  ]);
  const countries = originRows.map((r) => r.origin).filter((o): o is string => Boolean(o));

  const count = cartCount(cart);

  return (
    <Container className="py-8 lg:py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Wholesale</p>
          <h1 className="mt-1 font-display text-3xl text-olive-900">Build your order</h1>
          <p className="mt-1 max-w-xl text-sm text-olive-600">
            Add the cases you want and submit a request — we&apos;ll confirm pricing and send
            an invoice. Prices change often, so they&apos;re quoted per order, not listed here.
          </p>
        </div>
        <Link
          href="/wholesale/cart"
          className="inline-flex items-center gap-2 rounded-full bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800"
        >
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          Your request{count > 0 ? ` (${count})` : ""}
        </Link>
      </div>

      {reorderItems.length > 0 && !q && !country ? (
        <ReorderGrid items={reorderItems} cart={cart} />
      ) : null}

      <form action="/wholesale/order" className="mt-6 flex flex-col gap-2 sm:max-w-2xl sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search the line sheet…"
            className="h-10 w-full rounded-lg border border-olive-200 pr-3 pl-9 text-sm focus:border-olive-500 focus:outline-none"
          />
        </div>
        {countries.length > 0 ? (
          <select
            name="country"
            defaultValue={country}
            className="h-10 rounded-lg border border-olive-200 bg-white px-3 text-sm focus:border-olive-500 focus:outline-none sm:w-48"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : null}
        <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white">Search</button>
      </form>

      <p className="mt-4 text-xs text-olive-500">
        {total.toLocaleString()} item{total === 1 ? "" : "s"}
        {country ? ` from ${country}` : ""}
        {total > 60 ? " · showing the first 60, search to narrow" : ""}
      </p>

      {products.length === 0 ? (
        <div className="mt-6 rounded-xl border border-olive-100 bg-white p-10 text-center text-olive-600">
          {q || country ? `No items match${q ? ` “${q}”` : ""}${country ? ` from ${country}` : ""}.` : "No items available."}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const variant = p.variants[0];
            const unitSize = variant?.name ?? null;
            const casePack = variant?.unitsPerCase ?? p.casePack ?? null;
            const inCart = cart[p.slug] ?? 0;
            return (
              <div key={p.id} className="flex gap-3 rounded-xl border border-olive-100 bg-white p-3">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-contain" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-olive-50 text-[10px] text-olive-400">no photo</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-olive-900">{p.name}</p>
                  <p className="mt-0.5 text-xs text-olive-500">
                    {[unitSize, casePack ? `${casePack}/case` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <form action="/wholesale/order/add" method="post" className="mt-2 flex items-center gap-1.5">
                    <input type="hidden" name="slug" value={p.slug} />
                    <input type="hidden" name="from" value={q ? `/wholesale/order?q=${encodeURIComponent(q)}` : "/wholesale/order"} />
                    <label className="sr-only" htmlFor={`cases-${p.id}`}>Cases</label>
                    <input
                      id={`cases-${p.id}`}
                      name="cases"
                      type="number"
                      min={0}
                      max={9999}
                      defaultValue={inCart || 1}
                      className="h-9 w-16 rounded-lg border border-olive-200 px-2 text-sm focus:border-olive-500 focus:outline-none"
                    />
                    <span className="text-xs text-olive-500">cases</span>
                    <button className="ml-auto h-9 rounded-lg bg-olive-100 px-3 text-sm font-medium text-olive-800 hover:bg-olive-200">
                      {inCart ? "Update" : "Add"}
                    </button>
                  </form>
                  {inCart ? <p className="mt-1 text-xs font-medium text-emerald-700">{inCart} in request</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
