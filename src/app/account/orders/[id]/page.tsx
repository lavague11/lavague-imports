import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { AccountHeader } from "@/components/account/account-header";
import { OrderStatusPill } from "@/components/account/order-status-pill";
import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function CustomerOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customer = await getCustomer();
  const { id } = await params;
  if (!customer) redirect(`/login?next=/account/orders/${id}`);
  if (customer.role !== "WHOLESALE") redirect("/account");

  const prisma = getPrisma();
  if (!prisma) return <Container className="py-16 text-center text-olive-700">Unavailable — try again shortly.</Container>;

  // Owner-gated: the customerId is part of the lookup, so another account's URL
  // returns null → 404 (never reveals someone else's order).
  const order = await prisma.orderRequest.findFirst({
    where: { id, customerId: customer.id },
    include: { lines: { orderBy: { productName: "asc" } }, invoices: { where: { publicToken: { not: null } }, select: { publicToken: true, number: true } } },
  });
  if (!order) notFound();

  const sp = await searchParams;
  const totalCases = order.lines.reduce((s, l) => s + l.cases, 0);

  // Prices are shown ONLY for a sent quote (QUOTED + quoteSentAt), or afterward
  // once the customer has approved it (APPROVED / INVOICED). Never for SUBMITTED
  // or CHANGES_REQUESTED.
  const quoteSent = order.status === "QUOTED" && order.quoteSentAt != null;
  const showPrices = quoteSent || order.status === "APPROVED" || order.status === "INVOICED";
  const invoice = order.invoices[0];

  return (
    <Container className="max-w-3xl py-12 lg:py-16">
      <AccountHeader name={customer.name} email={customer.email} isWholesale />

      <Link href="/account/orders" className="mt-8 inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-olive-900">{order.reference}</h1>
        <OrderStatusPill status={order.status} />
        <span className="text-sm text-olive-500">{dateFmt(order.createdAt)}</span>
      </div>

      {sp.approved ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Quote approved — thank you. We&apos;ll send your invoice shortly.</p> : null}
      {sp.changes ? <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">Your change request was sent. We&apos;ll re-quote and let you know.</p> : null}
      {sp.error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Sorry — that didn&apos;t go through. Please refresh and try again.</p> : null}

      {/* Status-specific lead line */}
      {order.status === "SUBMITTED" ? (
        <p className="mt-5 rounded-lg bg-olive-50 px-4 py-3 text-sm text-olive-700">We&apos;re preparing your quote — you&apos;ll see pricing here once it&apos;s ready.</p>
      ) : null}
      {order.status === "CHANGES_REQUESTED" ? (
        <div className="mt-5 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <p>Thanks — we&apos;re re-quoting based on your changes.</p>
          {order.customerChangeNote ? <p className="mt-1 text-orange-700">You asked: &ldquo;{order.customerChangeNote}&rdquo;</p> : null}
        </div>
      ) : null}
      {order.status === "APPROVED" ? (
        <p className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You approved this quote{order.approvedAt ? ` on ${dateFmt(order.approvedAt)}` : ""}. Your invoice is on the way.
        </p>
      ) : null}
      {order.status === "INVOICED" ? (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          This order has been invoiced.{invoice ? <> <Link href={`/invoice/${invoice.publicToken}`} className="font-medium underline">View invoice {invoice.number}</Link>.</> : null}
        </p>
      ) : null}

      {/* Lines + (when allowed) prices */}
      <div className="mt-5 overflow-hidden rounded-xl border border-olive-100 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Unit</th>
              <th className="p-3 text-right">Cases</th>
              {showPrices ? <th className="p-3 text-right">Price / case</th> : null}
              {showPrices ? <th className="p-3 text-right">Line total</th> : null}
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-b border-olive-50 last:border-0">
                <td className="p-3 font-medium text-olive-900">{l.productName}</td>
                <td className="p-3 text-olive-600">{[l.unitSize, l.casePack ? `${l.casePack}/case` : null].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-3 text-right text-olive-800">{l.cases}</td>
                {showPrices ? <td className="p-3 text-right text-olive-700">{l.quotedUnitPriceCents != null ? formatPrice(l.quotedUnitPriceCents) : "—"}</td> : null}
                {showPrices ? <td className="p-3 text-right text-olive-900">{l.quotedLineTotalCents != null ? formatPrice(l.quotedLineTotalCents) : "—"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPrices ? (
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <Row label="Subtotal" value={order.quoteSubtotalCents} />
          {order.quoteDiscountCents ? <Row label="Discount" value={-order.quoteDiscountCents} /> : null}
          {order.quoteShippingCents ? <Row label="Shipping" value={order.quoteShippingCents} /> : null}
          {order.quoteTaxCents ? <Row label="Tax" value={order.quoteTaxCents} /> : null}
          <div className="flex w-full max-w-xs items-center justify-between border-t border-olive-100 pt-2">
            <span className="font-medium text-olive-800">Total</span>
            <span className="text-base font-semibold text-olive-900">{formatPrice(order.quoteTotalCents ?? 0)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-right text-xs text-olive-500">{order.lines.length} items · {totalCases} cases</p>
      )}

      {/* Actions — only on a live, sent quote */}
      {quoteSent ? (
        <div className="mt-8 space-y-6">
          <form action={`/account/orders/${order.id}/approve`} method="post">
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-full bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800">
              Approve quote
            </button>
            <span className="ml-3 text-sm text-olive-500">Nothing is charged — we&apos;ll invoice you after you approve.</span>
          </form>

          <details className="rounded-xl border border-olive-100 bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium text-olive-800">Need changes?</summary>
            <form action={`/account/orders/${order.id}/request-changes`} method="post" className="mt-4 space-y-4">
              <p className="text-sm text-olive-600">Adjust case quantities and/or tell us what to change. We&apos;ll re-quote.</p>
              <div className="space-y-2">
                {order.lines.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-olive-800">{l.productName}{l.unitSize ? <span className="text-olive-400"> · {l.unitSize}</span> : null}</span>
                    <label className="flex items-center gap-2">
                      <input
                        name={`cases_${l.id}`}
                        type="number"
                        min={1}
                        max={9999}
                        defaultValue={l.cases}
                        className="h-9 w-20 rounded-lg border border-olive-200 px-2 text-right text-sm focus:border-olive-500 focus:outline-none"
                        aria-label={`Cases of ${l.productName}`}
                      />
                      <span className="text-olive-500">cases</span>
                    </label>
                  </div>
                ))}
              </div>
              <textarea
                name="note"
                rows={3}
                placeholder="What would you like changed?"
                className="w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
              />
              <button type="submit" className="rounded-lg border border-olive-300 bg-white px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50">
                Request changes
              </button>
            </form>
          </details>
        </div>
      ) : null}
    </Container>
  );
}

function Row({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex w-full max-w-xs items-center justify-between">
      <span className="text-olive-600">{label}</span>
      <span className="text-olive-900">{formatPrice(value ?? 0)}</span>
    </div>
  );
}
