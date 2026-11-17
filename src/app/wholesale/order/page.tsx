import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";

import { Container } from "@/components/ui/container";
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
  const cart = await readWholesaleCart();

  // "Your usual items" — products from past requests that are still orderable.
  const past = await prisma.orderRequestLine.findMany({
    where: { request: { customerId: customer.id }, slug: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { slug: true, cases: true },
  });
  const lastCases = new Map<string, number>();
  for (const l of past) if (l.slug && !lastCases.has(l.slug)) lastCases.set(l.slug, l.cases);
  const usualProducts =
    lastCases.size > 0
      ? await prisma.product.findMany({
          where: { slug: { in: [...lastCases.keys()] }, isActive: true, wholesaleEnabled: true },
          include: { variants: { orderBy: { position: "asc" }, take: 1 } },
          take: 12,
        })
      : [];

  const where = {
    isActive: true,
    wholesaleEnabled: true,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: { name: "asc" },
      take: 60,
    }),
    prisma.product.count({ where }),
  ]);

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

      {usualProducts.length > 0 && !q ? (
        <section className="mt-6 rounded-xl border border-olive-100 bg-olive-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-olive-900">Your usual items</h2>
            <form action="/wholesale/order/reorder" method="post">
              <button className="rounded-full bg-olive-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-olive-800">
                Reorder all
              </button>
            </form>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {usualProducts.map((p) => {
              const last = lastCases.get(p.slug) ?? 1;
              const inCart = cart[p.slug] ?? 0;
              return (
                <form key={p.id} action="/wholesale/order/add" method="post" className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2">
                  <input type="hidden" name="slug" value={p.slug} />
                  <input type="hidden" name="from" value="/wholesale/order" />
                  <span className="min-w-0 flex-1 truncate text-sm text-olive-800">{p.name}</span>
                  <input name="cases" type="number" min={0} max={9999} defaultValue={inCart || last} className="h-8 w-14 rounded-lg border border-olive-200 px-1.5 text-sm focus:border-olive-500 focus:outline-none" />
                  <button className="h-8 rounded-lg bg-olive-100 px-2.5 text-xs font-medium text-olive-800 hover:bg-olive-200">
                    {inCart ? "✓" : "Add"}
                  </button>
                </form>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-olive-500">Last ordered quantities shown. “Reorder all” adds them to your request.</p>
        </section>
      ) : null}

      <form action="/wholesale/order" className="mt-6 flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search the line sheet…"
            className="h-10 w-full rounded-lg border border-olive-200 pr-3 pl-9 text-sm focus:border-olive-500 focus:outline-none"
          />
        </div>
        <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white">Search</button>
      </form>

      <p className="mt-4 text-xs text-olive-500">
        {total.toLocaleString()} item{total === 1 ? "" : "s"}
        {total > 60 ? " · showing the first 60, search to narrow" : ""}
      </p>

      {products.length === 0 ? (
        <div className="mt-6 rounded-xl border border-olive-100 bg-white p-10 text-center text-olive-600">
          {q ? `No items match “${q}”.` : "No items available."}
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
