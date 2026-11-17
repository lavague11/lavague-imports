import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { readWholesaleCart } from "@/lib/wholesale-cart";

export const metadata = {
  title: "Your order request",
  robots: { index: false, follow: false },
};

export default async function WholesaleCartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/wholesale/cart");
  if (customer.role !== "WHOLESALE") redirect("/account");

  const prisma = getPrisma();
  if (!prisma) return <Container className="py-16 text-center text-olive-700">Unavailable — try again shortly.</Container>;

  const params = await searchParams;
  const hadError = params.error === "1";
  const cart = await readWholesaleCart();
  const slugs = Object.keys(cart);

  const products = slugs.length
    ? await prisma.product.findMany({
        where: { slug: { in: slugs } },
        include: { variants: { orderBy: { position: "asc" }, take: 1 } },
      })
    : [];
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const items = slugs
    .map((slug) => ({ slug, cases: cart[slug], product: bySlug.get(slug) }))
    .filter((i) => i.product)
    .sort((a, b) => (a.product!.name).localeCompare(b.product!.name));
  const totalCases = items.reduce((s, i) => s + i.cases, 0);

  return (
    <Container className="max-w-3xl py-8 lg:py-12">
      <Link href="/wholesale/order" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the line sheet
      </Link>
      <h1 className="mt-3 font-display text-3xl text-olive-900">Your order request</h1>

      {hadError ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Something went wrong submitting your request. Please try again.
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-olive-100 bg-white p-10 text-center">
          <p className="text-olive-700">Your request is empty.</p>
          <Link href="/wholesale/order" className="mt-3 inline-block rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
            Browse the line sheet
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-5 divide-y divide-olive-100 rounded-xl border border-olive-100 bg-white">
            {items.map(({ slug, cases, product }) => {
              const variant = product!.variants[0];
              const unitSize = variant?.name ?? null;
              const casePack = variant?.unitsPerCase ?? product!.casePack ?? null;
              return (
                <div key={slug} className="flex items-center gap-3 p-3">
                  {product!.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product!.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-contain" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-olive-50 text-[10px] text-olive-400">no photo</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium text-olive-900">{product!.name}</p>
                    <p className="text-xs text-olive-500">{[unitSize, casePack ? `${casePack}/case` : null].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <form action="/wholesale/order/add" method="post" className="flex items-center gap-1.5">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="from" value="/wholesale/cart" />
                    <input name="cases" type="number" min={0} max={9999} defaultValue={cases} className="h-9 w-16 rounded-lg border border-olive-200 px-2 text-sm focus:border-olive-500 focus:outline-none" />
                    <button className="h-9 rounded-lg bg-olive-100 px-2.5 text-xs font-medium text-olive-800 hover:bg-olive-200">Update</button>
                  </form>
                  <form action="/wholesale/order/add" method="post">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="cases" value="0" />
                    <input type="hidden" name="from" value="/wholesale/cart" />
                    <button className="h-9 rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50" aria-label={`Remove ${product!.name}`}>Remove</button>
                  </form>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-sm text-olive-600">
            {items.length} item{items.length === 1 ? "" : "s"} · {totalCases} case{totalCases === 1 ? "" : "s"} total.
            No prices are shown — we&apos;ll quote your request and send an invoice.
          </p>

          <form action="/wholesale/cart/submit" method="post" className="mt-5">
            <label htmlFor="note" className="mb-1 block text-sm font-medium text-olive-800">Note (optional)</label>
            <textarea id="note" name="note" rows={3} placeholder="Delivery timing, PO number, anything we should know…" className="w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none" />
            <button type="submit" className="mt-3 h-11 rounded-lg bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800">
              Submit order request
            </button>
          </form>
        </>
      )}
    </Container>
  );
}
