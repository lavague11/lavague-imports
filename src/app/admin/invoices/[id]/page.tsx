import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Pencil, Send, Trash2 } from "lucide-react";

import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { CopyLink } from "@/components/admin/copy-link";
import { PaymentPhotoField } from "@/components/admin/payment-photo";
import { PhotoUpload } from "@/components/admin/photo-upload";
import { getCurrentUser } from "@/lib/auth";
import { composeAddress } from "@/lib/address";
import { getPrisma } from "@/lib/db";
import {
  invoiceDisplay,
  paymentMethodLabel,
  PAYMENT_METHODS,
  WHOLESALE_MINIMUM_CENTS,
} from "@/lib/invoice";
import { photoKindLabel, PHOTO_KIND_BADGE } from "@/lib/invoice-photo-constants";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Invoice · Admin",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const today = () => new Date().toISOString().slice(0, 10);

const FLASH: Record<string, { ok?: boolean; text: string }> = {
  "sent:1": { ok: true, text: "Invoice emailed to the customer." },
  "sent:link": { ok: true, text: "Invoice marked sent. Email isn't set up yet — copy the customer link below to share it." },
  "paid:1": { ok: true, text: "Payment recorded." },
  "delivered:1": { ok: true, text: "Delivery recorded." },
  "delivered:cleared": { ok: true, text: "Delivery cleared." },
  "voided:1": { ok: true, text: "Invoice voided." },
  "unvoided:1": { ok: true, text: "Invoice restored." },
  "photo:1": { ok: true, text: "Photo uploaded." },
  "photo:deleted": { ok: true, text: "Photo removed." },
  "photo:none": { text: "Choose a photo first." },
  "photo:bad": { text: "Couldn't read that image — try a different file." },
  "photo:error": { text: "Couldn't save the photo — try again." },
  "error:amount": { text: "Enter a payment amount greater than zero." },
  "error:nocustomer": { text: "Add a customer to this invoice before sending it." },
  "error:void": { text: "That action isn't available on a voided invoice." },
  "error:send": { text: "Couldn't send — try again." },
  "error:payment": { text: "Couldn't record the payment — try again." },
  "error:deliver": { text: "Couldn't update delivery — try again." },
  "error:save": { text: "Couldn't save the invoice — try again." },
};

export default async function InvoiceDetail({
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
  const invoice = await prisma.customerInvoice.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { orderBy: { id: "asc" } },
      payments: { orderBy: { receivedAt: "desc" } },
      photos: { orderBy: { createdAt: "desc" } },
      orderRequest: { select: { id: true, reference: true } },
    },
  });
  if (!invoice) notFound();

  const c = invoice.customer;
  const now = new Date();
  const disp = invoiceDisplay(invoice, now);
  const balance = invoice.totalCents - invoice.paidCents;
  const addr = c ? composeAddress(c) : null;
  const customerName = c ? c.businessName || c.name || c.email : "No customer yet";

  const flashKey = ["sent", "paid", "delivered", "voided", "unvoided", "photo", "error"]
    .map((k) => (sp[k] ? `${k}:${firstValue(sp[k])}` : null))
    .find(Boolean);
  const flash = flashKey ? FLASH[flashKey] : undefined;

  const isVoid = invoice.status === "VOID";
  const belowMin = c?.role === "WHOLESALE" && invoice.subtotalCents > 0 && invoice.subtotalCents < WHOLESALE_MINIMUM_CENTS;

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All invoices
      </Link>

      {flash ? (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${flash.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {flash.text}
        </div>
      ) : null}

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl text-olive-900">{invoice.number}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${disp.badge}`}>{disp.label}</span>
          </div>
          <p className="mt-1 text-sm text-olive-600">
            {c ? (
              <Link href={`/admin/customers/${c.id}`} className="font-medium text-olive-800 hover:underline">{customerName}</Link>
            ) : (
              <Link href={`/admin/invoices/${id}/edit`} className="font-medium text-amber-700 hover:underline">No customer yet — add one</Link>
            )}
            {" · "}Issued {dateFmt(invoice.issueDate)}{invoice.dueDate ? ` · due ${dateFmt(invoice.dueDate)}` : ""}
            {invoice.orderRequest ? <> · from <Link href={`/admin/orders/${invoice.orderRequest.id}`} className="hover:underline">{invoice.orderRequest.reference}</Link></> : null}
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="mt-4 flex flex-wrap gap-2">
        {!isVoid ? (
          <Link href={`/admin/invoices/${id}/edit`} className={`${btn} border border-olive-200 text-olive-700 hover:bg-olive-50`}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        ) : null}
        <a href={`/admin/invoices/${id}/pdf`} target="_blank" rel="noreferrer" className={`${btn} border border-olive-200 text-olive-700 hover:bg-olive-50`}>
          <Download className="h-4 w-4" /> PDF
        </a>
        {!isVoid && c ? (
          <form method="post" action={`/admin/invoices/${id}/send`}>
            <button className={`${btn} bg-olive-900 text-white hover:bg-olive-800`}>
              <Send className="h-4 w-4" /> {invoice.sentAt ? "Resend" : "Send to customer"}
            </button>
          </form>
        ) : !isVoid ? (
          <Link href={`/admin/invoices/${id}/edit`} className={`${btn} border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}>
            <Send className="h-4 w-4" /> Add a customer to send
          </Link>
        ) : null}
        {isVoid ? (
          <form method="post" action={`/admin/invoices/${id}/void`}>
            <input type="hidden" name="unvoid" value="1" />
            <button className={`${btn} border border-olive-200 text-olive-700 hover:bg-olive-50`}>Restore</button>
          </form>
        ) : (
          <form method="post" action={`/admin/invoices/${id}/void`}>
            <ConfirmSubmit message={`Void ${invoice.number}? It stays on the books as voided and can be restored.`} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>
              Void
            </ConfirmSubmit>
          </form>
        )}
      </div>

      {belowMin ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Below the ${WHOLESALE_MINIMUM_CENTS / 100} wholesale minimum (subtotal {formatPrice(invoice.subtotalCents)}).
        </p>
      ) : null}

      {/* Customer link */}
      {invoice.publicToken ? (
        <div className="mt-4 rounded-xl border border-olive-100 bg-white p-4">
          <p className="text-xs font-medium text-olive-600">Customer link</p>
          <p className="mb-2 text-xs text-olive-500">They can view, download the PDF, and accept the invoice here — no sign-in needed.</p>
          <CopyLink path={`/invoice/${invoice.publicToken}`} />
        </div>
      ) : null}

      {/* Bill to + line items */}
      <div className="mt-4 rounded-xl border border-olive-100 bg-white p-5">
        <div className="text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-olive-400">Bill to</p>
          {c ? (
            <>
              <p className="mt-1 font-medium text-olive-900">{customerName}</p>
              {c.name && c.businessName ? <p className="text-olive-600">{c.name}</p> : null}
              <p className="text-olive-600">{c.email}</p>
              {addr ? <p className="text-olive-500">{addr}</p> : null}
            </>
          ) : (
            <p className="mt-1 text-amber-700">No customer yet. <Link href={`/admin/invoices/${id}/edit`} className="underline">Add one in the editor</Link>.</p>
          )}
          {invoice.poNumber ? <p className="mt-1 text-olive-500">PO: {invoice.poNumber}</p> : null}
          {invoice.terms ? <p className="text-olive-500">Terms: {invoice.terms}</p> : null}
        </div>

        <table className="mt-5 w-full text-sm">
          <thead className="border-b border-olive-100 text-left text-olive-500">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 ? (
              <tr><td colSpan={4} className="py-6 text-center text-olive-400">No line items yet — <Link href={`/admin/invoices/${id}/edit`} className="underline">add some</Link >.</td></tr>
            ) : invoice.lines.map((l) => (
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
          <Amount label="Subtotal" value={formatPrice(invoice.subtotalCents)} />
          {invoice.discountCents > 0 ? <Amount label="Discount" value={`−${formatPrice(invoice.discountCents)}`} /> : null}
          {invoice.shippingCents > 0 ? <Amount label="Delivery" value={formatPrice(invoice.shippingCents)} /> : null}
          {invoice.taxCents > 0 ? <Amount label="Tax" value={formatPrice(invoice.taxCents)} /> : null}
          <Amount label="Total" value={formatPrice(invoice.totalCents)} bold />
          {invoice.paidCents > 0 ? <Amount label="Paid" value={`−${formatPrice(invoice.paidCents)}`} /> : null}
          <Amount label="Balance due" value={formatPrice(Math.max(0, balance))} bold danger={balance > 0} />
        </div>

        {invoice.notes ? <p className="mt-4 border-t border-olive-100 pt-3 text-sm text-olive-600 whitespace-pre-wrap">{invoice.notes}</p> : null}
      </div>

      {/* Payments */}
      <section className="mt-6">
        <h2 className="font-display text-lg text-olive-900">Payments</h2>
        {invoice.payments.length === 0 ? (
          <p className="mt-2 text-sm text-olive-500">No payments recorded yet.</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-xl border border-olive-100 bg-white">
            <table className="w-full text-sm">
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b border-olive-50 last:border-0">
                    <td className="p-3 whitespace-nowrap text-olive-600">{dateFmt(p.receivedAt)}</td>
                    <td className="p-3 text-olive-700">{paymentMethodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ""}</td>
                    <td className="p-3 text-olive-400">{p.note ?? ""}</td>
                    <td className="p-3 text-right font-medium text-olive-900">{formatPrice(p.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isVoid ? (
          <form method="post" action={`/admin/invoices/${id}/payment`} encType="multipart/form-data" className="mt-3 rounded-xl border border-olive-100 bg-white p-4">
            <p className="text-sm font-medium text-olive-800">Record a payment</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div>
                <label className="text-xs text-olive-500">Amount</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-olive-400">$</span>
                  <input name="amount" inputMode="decimal" defaultValue={balance > 0 ? (balance / 100).toFixed(2) : ""} placeholder="0.00" className="h-10 w-full rounded-lg border border-olive-200 pl-6 pr-3 text-sm focus:border-olive-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-olive-500">Method</label>
                <select name="method" defaultValue="CHECK" className="h-10 w-full rounded-lg border border-olive-200 bg-white px-2 text-sm focus:border-olive-500 focus:outline-none">
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-olive-500">Reference</label>
                <input name="reference" placeholder="Check #, trace…" className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-olive-500">Received</label>
                <input type="date" name="receivedAt" defaultValue={today()} className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
              </div>
            </div>
            <div className="mt-3"><PaymentPhotoField /></div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <input name="note" placeholder="Optional note" className="h-10 flex-1 rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
              <button className="h-10 shrink-0 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800">Record</button>
            </div>
            <p className="mt-2 text-xs text-olive-400">Attach a photo of the check or receipt (optional) — it&apos;s saved to this invoice. Online card payments (Stripe) are a separate integration.</p>
          </form>
        ) : null}
      </section>

      {/* Delivery */}
      <section className="mt-6">
        <h2 className="font-display text-lg text-olive-900">Delivery</h2>
        {invoice.deliveredAt ? (
          <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
            <p className="font-medium text-emerald-800">Delivered {dateFmt(invoice.deliveredAt)}{invoice.deliveredBy ? ` · received by ${invoice.deliveredBy}` : ""}</p>
            {invoice.deliveryNote ? <p className="mt-1 text-olive-600">{invoice.deliveryNote}</p> : null}
            <form method="post" action={`/admin/invoices/${id}/deliver`} className="mt-2">
              <input type="hidden" name="clear" value="1" />
              <button className="text-xs text-olive-500 underline hover:text-olive-800">Clear delivery</button>
            </form>
          </div>
        ) : (
          <form method="post" action={`/admin/invoices/${id}/deliver`} className="mt-2 rounded-xl border border-olive-100 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs text-olive-500">Delivered on</label>
                <input type="date" name="deliveredAt" defaultValue={today()} className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-olive-500">Received by</label>
                <input name="deliveredBy" placeholder="Name at the store" className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
              </div>
              <div className="flex items-end">
                <button className="h-10 w-full rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800">Mark delivered</button>
              </div>
            </div>
            <input name="deliveryNote" placeholder="Optional note (e.g. left at receiving dock)" className="mt-3 h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none" />
          </form>
        )}
      </section>

      {/* Signature */}
      <section className="mt-6 mb-4">
        <h2 className="font-display text-lg text-olive-900">Acceptance</h2>
        {invoice.signedAt ? (
          <div className="mt-2 rounded-xl border border-olive-100 bg-white p-4 text-sm">
            <p className="font-medium text-olive-900">Accepted by {invoice.signerName} on {dateTimeFmt(invoice.signedAt)}</p>
            {invoice.signatureData ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={invoice.signatureData} alt="Customer signature" className="mt-2 h-20 rounded border border-olive-100 bg-white object-contain" />
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-olive-500">
            Not yet accepted. {invoice.publicToken ? "The customer can accept it from their link above." : "Send the invoice to let the customer accept it online."}
          </p>
        )}
      </section>

      {/* Photos */}
      <section className="mt-6 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-olive-900">Photos</h2>
          <a href="/admin/photos" className="text-sm text-olive-600 hover:text-olive-900">Photo library →</a>
        </div>
        <p className="mt-0.5 mb-2 text-xs text-olive-500">Proof of delivery, a check or payment, or anything else — saved to this invoice.</p>

        {invoice.photos.length > 0 ? (
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {invoice.photos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-olive-100 bg-white">
                <a href={p.url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.label ?? photoKindLabel(p.kind)} className="h-32 w-full object-cover" />
                </a>
                <div className="flex items-center justify-between gap-1 p-2">
                  <span className={`truncate rounded-full px-2 py-0.5 text-xs font-medium ${PHOTO_KIND_BADGE[p.kind] ?? "bg-olive-100 text-olive-700"}`} title={p.label ?? photoKindLabel(p.kind)}>
                    {p.kind === "OTHER" && p.label ? p.label : photoKindLabel(p.kind)}
                  </span>
                  <form method="post" action={`/admin/invoices/${id}/photo/delete`} className="shrink-0">
                    <input type="hidden" name="photoId" value={p.id} />
                    <ConfirmSubmit message="Delete this photo?" className="text-olive-300 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <PhotoUpload action={`/admin/invoices/${id}/photo`} />
      </section>
    </div>
  );
}

function Amount({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${danger ? "text-red-700" : bold ? "text-olive-900" : "text-olive-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
