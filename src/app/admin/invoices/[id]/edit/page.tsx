import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CustomerSearchBar, type CustomerSearchOption } from "@/components/admin/customer-search-bar";
import { InvoiceEditForm } from "@/components/admin/invoice-edit-form";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Edit invoice · Admin",
  robots: { index: false, follow: false },
};

const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const dollarsOrBlank = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : "");
const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const FLASH: Record<string, { ok?: boolean; text: string }> = {
  "customer:set": { ok: true, text: "Customer assigned." },
  "customer:created": { ok: true, text: "New customer created and assigned." },
  "customer:cleared": { ok: true, text: "Customer removed — this is a blank draft again." },
  "error:customer": { text: "Couldn't assign that customer — try again." },
  "error:number": { text: "That invoice number is already in use. Pick another." },
  "error:save": { text: "Couldn't save the invoice — try again." },
};

export default async function EditInvoice({
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
  const [invoice, customerRows] = await Promise.all([
    prisma.customerInvoice.findUnique({
      where: { id },
      include: { customer: true, lines: { orderBy: { id: "asc" } } },
    }),
    prisma.customer.findMany({
      orderBy: [{ businessName: "asc" }, { name: "asc" }],
      select: { id: true, businessName: true, name: true, email: true, phone: true },
      take: 2000,
    }),
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

  const flashKey = ["customer", "error"].map((k) => (sp[k] ? `${k}:${firstValue(sp[k])}` : null)).find(Boolean);
  const flash = flashKey ? FLASH[flashKey] : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/admin/invoices/${id}`} className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to invoice
      </Link>

      <div className="mt-3">
        <h1 className="font-display text-2xl text-olive-900">
          {customerName ?? "New invoice"}
          <span className="ml-2 align-middle text-base font-normal text-olive-400">{invoice.number}</span>
        </h1>
      </div>

      <div className="mt-3">
        <CustomerSearchBar invoiceId={id} current={current} customers={customers} />
      </div>

      {flash ? (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${flash.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {flash.text}
        </div>
      ) : null}

      <InvoiceEditForm
        action={`/admin/invoices/${id}/save`}
        cancelHref={`/admin/invoices/${id}`}
        number={invoice.number}
        customerId={c?.id ?? null}
        customerRole={(c?.role as "CUSTOMER" | "WHOLESALE" | undefined) ?? null}
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
    </div>
  );
}
