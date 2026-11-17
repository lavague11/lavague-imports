import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";

import { SignInvoice } from "@/components/invoice/sign-invoice";
import { composeAddress } from "@/lib/address";
import { getPrisma } from "@/lib/db";
import { invoiceDisplay } from "@/lib/invoice";
import { site, fullAddress } from "@/lib/site";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Your invoice · La Vague Imports",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function PublicInvoice({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const prisma = getPrisma();
  if (!prisma) return <p className="mx-auto max-w-xl px-4 py-16 text-center text-olive-700">This invoice is temporarily unavailable. Please try again shortly.</p>;

  const invoice = await prisma.customerInvoice.findUnique({
    where: { publicToken: token },
    include: { customer: true, lines: { orderBy: { id: "asc" } } },
  });
  if (!invoice) notFound();

  const c = invoice.customer;
  const disp = invoiceDisplay(invoice);
  const balance = Math.max(0, invoice.totalCents - invoice.paidCents);
  const addr = composeAddress(c);
  const isVoid = invoice.status === "VOID";

  const signed = firstValue(sp.signed);
  const error = firstValue(sp.error);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {signed ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {signed === "already" ? "This invoice was already accepted." : "Thank you — your acceptance has been recorded."}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "name" ? "Please enter your name to accept." : "Something went wrong — please try again."}
        </div>
      ) : null}

      <div className="rounded-2xl border border-olive-100 bg-white p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-olive-500">La Vague Imports</p>
            <h1 className="font-display text-2xl text-olive-900">Invoice {invoice.number}</h1>
            <p className="mt-1 text-sm text-olive-500">
              Issued {dateFmt(invoice.issueDate)}{invoice.dueDate ? ` · due ${dateFmt(invoice.dueDate)}` : ""}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${disp.badge}`}>{disp.label}</span>
        </div>

        {/* Parties */}
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-olive-400">Billed to</p>
            <p className="mt-1 font-medium text-olive-900">{c.businessName || c.name || c.email}</p>
            {c.name && c.businessName ? <p className="text-olive-600">{c.name}</p> : null}
            <p className="text-olive-600">{c.email}</p>
            {addr ? <p className="text-olive-500">{addr}</p> : null}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-olive-400">From</p>
            <p className="mt-1 font-medium text-olive-900">{site.name}</p>
            <p className="text-olive-500">{fullAddress}</p>
            <p className="text-olive-500">{site.email}</p>
          </div>
        </div>

        {/* Lines */}
        <table className="mt-6 w-full text-sm">
          <thead className="border-b border-olive-100 text-left text-olive-500">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-olive-50">
                <td className="py-2 text-olive-800">{l.description}</td>
                <td className="py-2 text-right text-olive-600">{l.quantity}</td>
                <td className="py-2 text-right text-olive-600">{formatPrice(l.unitPriceCents)}</td>
                <td className="py-2 text-right text-olive-800">{formatPrice(l.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={formatPrice(invoice.subtotalCents)} />
          {invoice.discountCents > 0 ? <Row label="Discount" value={`−${formatPrice(invoice.discountCents)}`} /> : null}
          {invoice.shippingCents > 0 ? <Row label="Delivery" value={formatPrice(invoice.shippingCents)} /> : null}
          {invoice.taxCents > 0 ? <Row label="Tax" value={formatPrice(invoice.taxCents)} /> : null}
          <Row label="Total" value={formatPrice(invoice.totalCents)} bold />
          {invoice.paidCents > 0 ? <Row label="Paid" value={`−${formatPrice(invoice.paidCents)}`} /> : null}
          <Row label="Balance due" value={formatPrice(balance)} bold danger={balance > 0} />
        </div>

        {invoice.notes ? <p className="mt-4 border-t border-olive-100 pt-3 text-sm text-olive-600 whitespace-pre-wrap">{invoice.notes}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={`/invoice/${token}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 px-4 py-2 text-sm font-medium text-olive-700 hover:bg-olive-50">
            <Download className="h-4 w-4" /> Download PDF
          </a>
        </div>
      </div>

      {/* Accept / sign — the primary action, right under the invoice. */}
      {isVoid ? (
        <div className="mt-5 rounded-2xl border border-olive-200 bg-olive-50 p-6 text-sm text-olive-600">
          This invoice has been voided. Please contact {site.email} with any questions.
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-2xl border border-olive-100 bg-white p-6">
            {invoice.signedAt ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm text-olive-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>Accepted by <strong>{invoice.signerName}</strong> on {dateTimeFmt(invoice.signedAt)}.</span>
                </p>
                <a href={`/invoice/${token}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 px-4 py-2 text-sm font-medium text-olive-700 hover:bg-olive-50">
                  <Download className="h-4 w-4" /> Download signed PDF
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-lg text-olive-900">Accept this invoice</h2>
                  <p className="mt-0.5 text-sm text-olive-600">Review it and add your signature.</p>
                </div>
                <SignInvoice pdfUrl={`/invoice/${token}/pdf`} action={`/invoice/${token}/sign`} defaultName={c.name || c.businessName || ""} />
              </div>
            )}
          </div>

          {/* How to pay — at the very bottom. */}
          {balance > 0 ? (
            <div className="mt-5 rounded-2xl border border-olive-100 bg-white p-6">
              <h2 className="font-display text-lg text-olive-900">How to pay</h2>
              <p className="mt-1 text-sm text-olive-600">
                Remit <strong>{formatPrice(balance)}</strong> by check or ACH, payable to {site.name}. Mail checks to {fullAddress}. Questions? Email {site.email}.
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-sm text-emerald-800">
              This invoice is paid in full. Thank you!
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${danger ? "text-red-700" : bold ? "text-olive-900" : "text-olive-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
