import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { QuoteEditor, type QuoteEditorLine } from "@/components/admin/quote-editor";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Order request · Admin",
  robots: { index: false, follow: false },
};

const BADGE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  QUOTED: "bg-sky-100 text-sky-800",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  INVOICED: "bg-emerald-100 text-emerald-700",
  DECLINED: "bg-red-100 text-red-700",
  CANCELLED: "bg-olive-100 text-olive-600",
};
const LABEL: Record<string, string> = {
  CHANGES_REQUESTED: "Changes requested",
};
const statusLabel = (s: string) => LABEL[s] ?? s.charAt(0) + s.slice(1).toLowerCase();

const centsToDollarStr = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

export default async function OrderRequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const { id } = await params;
  const sp = await searchParams;
  const order = await prisma.orderRequest.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { orderBy: { productName: "asc" } },
      invoices: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, totalCents: true } },
    },
  });
  if (!order) notFound();

  const totalCases = order.lines.reduce((s, l) => s + l.cases, 0);
  const c = order.customer;
  const quotable = order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED" || order.status === "QUOTED";

  // Prefill each line's price: the existing quote, else a wholesale default
  // (per-case price, then the product's base wholesale price). Admin-only —
  // never rendered to the customer.
  let editorLines: QuoteEditorLine[] = [];
  if (quotable) {
    const slugs = order.lines.map((l) => l.slug).filter((s): s is string => Boolean(s));
    const products = slugs.length
      ? await prisma.product.findMany({
          where: { slug: { in: slugs } },
          select: { slug: true, wholesalePriceCents: true, variants: { orderBy: { position: "asc" }, take: 1, select: { casePriceCents: true } } },
        })
      : [];
    const wholesaleBySlug = new Map(products.map((p) => [p.slug, p.variants[0]?.casePriceCents ?? p.wholesalePriceCents ?? null]));
    editorLines = order.lines.map((l) => ({
      id: l.id,
      productName: l.productName,
      unitSize: l.unitSize,
      casePack: l.casePack,
      cases: l.cases,
      priceDollars: centsToDollarStr(l.quotedUnitPriceCents ?? (l.slug ? wholesaleBySlug.get(l.slug) ?? null : null)),
    }));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-olive-900">{order.reference}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[order.status] ?? "bg-olive-100 text-olive-700"}`}>
          {statusLabel(order.status)}
        </span>
        <span className="text-sm text-olive-500">
          {order.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>

      {sp.sent ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Quote sent to the customer.</p> : null}
      {sp.saved ? <p className="mt-3 rounded-lg bg-olive-50 px-3 py-2 text-sm text-olive-700">Draft saved. The customer can&apos;t see it until you send.</p> : null}
      {sp.error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Couldn&apos;t save the quote — check the prices and try again.</p> : null}

      <div className="mt-4 rounded-xl border border-olive-100 bg-white p-4 text-sm">
        <p className="font-medium text-olive-900">
          <Link href={`/admin/customers/${c.id}`} className="hover:underline">{c.businessName || c.name || c.email}</Link>
        </p>
        <p className="text-olive-600">{[c.name, c.email, c.phone].filter(Boolean).join(" · ")}</p>
        {c.address ? <p className="text-olive-500">{c.address}</p> : null}
      </div>

      {order.note ? (
        <p className="mt-3 rounded-lg bg-olive-50 px-3 py-2 text-sm text-olive-700">
          <span className="font-medium">Customer note:</span> {order.note}
        </p>
      ) : null}
      {order.status === "CHANGES_REQUESTED" && order.customerChangeNote ? (
        <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <span className="font-medium">Changes requested:</span> {order.customerChangeNote}
        </p>
      ) : null}

      {quotable ? (
        <>
          <h2 className="mt-6 text-sm font-medium tracking-wide text-olive-500 uppercase">
            {order.status === "SUBMITTED" ? "Price this request" : "Quote"}
          </h2>
          <QuoteEditor
            orderId={order.id}
            status={order.status}
            lines={editorLines}
            discountDollars={centsToDollarStr(order.quoteDiscountCents)}
            shippingDollars={centsToDollarStr(order.quoteShippingCents)}
            taxDollars={centsToDollarStr(order.quoteTaxCents)}
          />
        </>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-olive-100 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Unit</th>
                <th className="p-3 text-right">Cases</th>
                <th className="p-3 text-right">Price / case</th>
                <th className="p-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id} className="border-b border-olive-50 last:border-0">
                  <td className="p-3 font-medium text-olive-900">{l.productName}</td>
                  <td className="p-3 text-olive-600">{l.unitSize ?? "—"}</td>
                  <td className="p-3 text-right text-olive-800">{l.cases}</td>
                  <td className="p-3 text-right text-olive-700">{l.quotedUnitPriceCents != null ? formatPrice(l.quotedUnitPriceCents) : "—"}</td>
                  <td className="p-3 text-right text-olive-900">{l.quotedLineTotalCents != null ? formatPrice(l.quotedLineTotalCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-olive-50/40">
                <td className="p-3 font-medium text-olive-700" colSpan={2}>{order.lines.length} items</td>
                <td className="p-3 text-right font-medium text-olive-900">{totalCases} cases</td>
                <td className="p-3 text-right text-olive-500">Total</td>
                <td className="p-3 text-right font-semibold text-olive-900">{order.quoteTotalCents != null ? formatPrice(order.quoteTotalCents) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {order.invoices.length > 0 ? (
        <div className="mt-4 rounded-xl border border-olive-100 bg-white p-4 text-sm">
          <p className="font-medium text-olive-800">Invoices from this request</p>
          <ul className="mt-2 space-y-1">
            {order.invoices.map((inv) => (
              <li key={inv.id}>
                <Link href={`/admin/invoices/${inv.id}`} className="text-olive-700 hover:underline">{inv.number}</Link>
                <span className="text-olive-400"> · {formatPrice(inv.totalCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Legacy direct-invoice path. Stage 4 replaces this with approval → invoice. */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-olive-100 pt-4">
        <form method="post" action={`/admin/orders/${order.id}/invoice`}>
          <button className="rounded-lg border border-olive-300 bg-white px-4 py-2 text-sm font-medium text-olive-700 hover:bg-olive-50">
            {order.invoices.length > 0 ? "Create another invoice" : "Create invoice directly"}
          </button>
        </form>
        <p className="text-sm text-olive-400">Bypasses the quote — seeds a blank invoice to price in the editor.</p>
      </div>
    </div>
  );
}
