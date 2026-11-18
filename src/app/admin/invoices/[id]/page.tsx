import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Pencil, Send } from "lucide-react";

import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { CopyLink } from "@/components/admin/copy-link";
import { CustomerSearchBar, type CustomerSearchOption } from "@/components/admin/customer-search-bar";
import { InvoiceEditForm } from "@/components/admin/invoice-edit-form";
import { InvoiceReadOnly } from "@/components/admin/invoice-readonly";
import { PaymentPhotoField } from "@/components/admin/payment-photo";
import { PhotoUpload } from "@/components/admin/photo-upload";
import { getCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import { invoiceDisplay, paymentMethodLabel, PAYMENT_METHODS } from "@/lib/invoice";
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
const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const dollarsOrBlank = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : "");

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
  "error:number": { text: "That invoice number is already in use. Pick another." },
  "customer:set": { ok: true, text: "Customer assigned." },
  "customer:created": { ok: true, text: "New customer created and assigned." },
  "customer:cleared": { ok: true, text: "Customer removed." },
};

// Single invoice page: header + actions, customer search, the full editor (lines,
// terms, sales rep, notes, totals), then payments, delivery and photos. The old
// /edit route redirects here.
export default async function InvoicePage({
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
  const [invoice, customerRows, categoryRows] = await Promise.all([
    prisma.customerInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { orderBy: { id: "asc" } },
        payments: { orderBy: { receivedAt: "desc" } },
        photos: { orderBy: { createdAt: "desc" } },
        orderRequest: { select: { id: true, reference: true } },
      },
    }),
    prisma.customer.findMany({
      orderBy: [{ businessName: "asc" }, { name: "asc" }],
      select: { id: true, businessName: true, name: true, email: true, phone: true },
      take: 2000,
    }),
    getCategories(),
  ]);
  if (!invoice) notFound();

  const c = invoice.customer;
  const customerName = c ? c.businessName || c.name || c.email : null;
  const current = c ? { id: c.id, label: customerName as string } : null;
  const customers: CustomerSearchOption[] = customerRows.map((r) => ({
    id: r.id,
    label: r.businessName || r.name || r.email,
    sub: r.businessName && (r.name || r.email) ? r.name || r.email : r.email !== (r.businessName || r.name) ? r.email : "",
    phone: r.phone ?? "",
  }));
  const categories = categoryRows.map((cat) => ({ slug: cat.slug, name: cat.name }));

  const disp = invoiceDisplay(invoice, new Date());
  const balance = invoice.totalCents - invoice.paidCents;
  const isVoid = invoice.status === "VOID";
  // Imported history is read-only by default; ?edit=1 unlocks the editor.
  const isImported = invoice.source === "invoice_asap";
  const editing = !isImported || firstValue(sp.edit) === "1";

  const flashKey = ["sent", "paid", "delivered", "voided", "unvoided", "photo", "error", "customer"]
    .map((k) => (sp[k] ? `${k}:${firstValue(sp[k])}` : null))
    .find(Boolean);
  const flash = flashKey ? FLASH[flashKey] : undefined;

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

      {/* Header: customer name big, invoice number small/grey, status chip, actions */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-olive-900">
            {customerName ?? "New invoice"}
            <span className="ml-2 align-middle text-base font-normal text-olive-500">{invoice.externalNumber ?? invoice.number}</span>
            {invoice.externalNumber ? <span className="ml-1 align-middle text-xs font-normal text-olive-400">({invoice.number})</span> : null}
            <span className={`ml-2 inline-block align-middle rounded-full px-2 py-0.5 text-xs font-medium ${disp.badge}`}>{disp.label}</span>
          </h1>
          <p className="mt-1 text-sm text-olive-600">
            Issued {dateFmt(invoice.issueDate)}{invoice.dueDate ? ` · due ${dateFmt(invoice.dueDate)}` : ""}
            {invoice.deliveredAt ? ` · delivered ${dateFmt(invoice.deliveredAt)}` : ""}
            {invoice.orderRequest ? <> · from <Link href={`/admin/orders/${invoice.orderRequest.id}`} className="hover:underline">{invoice.orderRequest.reference}</Link></> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/invoices/${id}/pdf`} target="_blank" rel="noreferrer" className={`${btn} border border-olive-200 text-olive-700 hover:bg-olive-50`}>
            <Download className="h-4 w-4" /> PDF
          </a>
          {isImported && !editing ? (
            <Link href={`/admin/invoices/${id}?edit=1`} className={`${btn} border border-olive-200 text-olive-700 hover:bg-olive-50`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null}
          {!isVoid && c ? (
            <form method="post" action={`/admin/invoices/${id}/send`}>
              <button className={`${btn} bg-olive-900 text-white hover:bg-olive-800`}>
                <Send className="h-4 w-4" /> {invoice.sentAt ? "Resend" : "Send"}
              </button>
            </form>
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
      </div>

      {/* Customer search (edit mode only) */}
      {editing ? (
        <div className="mt-3">
          <CustomerSearchBar invoiceId={id} current={current} customers={customers} />
        </div>
      ) : null}

      {/* Customer link */}
      {invoice.publicToken ? (
        <div className="mt-4 rounded-xl border border-olive-100 bg-white p-4">
          <p className="text-xs font-medium text-olive-600">Customer link</p>
          <p className="mb-2 text-xs text-olive-500">They can view, download the PDF, and accept the invoice here — no sign-in needed.</p>
          <CopyLink path={`/invoice/${invoice.publicToken}`} />
        </div>
      ) : null}

      {!editing ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-olive-200 bg-olive-50/60 px-3 py-2 text-sm text-olive-600">
          <span>Imported from Invoice ASAP — read-only.</span>
          <Link href={`/admin/invoices/${id}?edit=1`} className="font-medium text-olive-900 underline">Edit this invoice</Link>
        </div>
      ) : null}

      {/* The invoice body: editor (edit mode) or a static read-only view */}
      {editing ? (
        <InvoiceEditForm
          action={`/admin/invoices/${id}/save`}
          cancelHref={isImported ? `/admin/invoices/${id}` : "/admin/invoices"}
          invoiceId={id}
          number={invoice.number}
          customerId={c?.id ?? null}
          customerRole={(c?.role as "CUSTOMER" | "WHOLESALE" | undefined) ?? null}
          categories={categories}
          issueDate={toInput(invoice.issueDate)}
          dueDate={toInput(invoice.dueDate)}
          terms={invoice.terms ?? ""}
          salesRep={invoice.salesRep ?? ""}
          notes={invoice.notes ?? ""}
          discount={dollarsOrBlank(invoice.discountCents)}
          shipping={dollarsOrBlank(invoice.shippingCents)}
          tax={dollarsOrBlank(invoice.taxCents)}
          lines={invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, isCredit: l.isCredit, creditReason: l.creditReason }))}
        />
      ) : (
        <InvoiceReadOnly
          terms={invoice.terms}
          issueLabel={dateFmt(invoice.issueDate)}
          dueLabel={invoice.dueDate ? dateFmt(invoice.dueDate) : null}
          salesRep={invoice.salesRep}
          lines={invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents, isCredit: l.isCredit, sku: l.sku }))}
          subtotalCents={invoice.subtotalCents}
          discountCents={invoice.discountCents}
          shippingCents={invoice.shippingCents}
          taxCents={invoice.taxCents}
          totalCents={invoice.totalCents}
          notes={invoice.notes}
        />
      )}

      {/* Payments */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg text-olive-900">Payments</h2>
          <p className="text-sm text-olive-600">Paid {formatPrice(invoice.paidCents)} · <span className={balance > 0 ? "font-semibold text-red-700" : "text-olive-500"}>Balance {formatPrice(Math.max(0, balance))}</span></p>
        </div>
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
                    <td className="p-3 text-right font-medium text-olive-900">−{formatPrice(p.amountCents)}</td>
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
                      <span className="text-xs">✕</span>
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
