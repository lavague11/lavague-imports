import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { InvoiceEditForm } from "@/components/admin/invoice-edit-form";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Edit invoice · Admin",
  robots: { index: false, follow: false },
};

const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const dollarsOrBlank = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : "");

export default async function EditInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const { id } = await params;
  const invoice = await prisma.customerInvoice.findUnique({
    where: { id },
    include: { customer: true, lines: { orderBy: { id: "asc" } } },
  });
  if (!invoice) notFound();

  const c = invoice.customer;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/admin/invoices/${id}`} className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to invoice
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl text-olive-900">Edit {invoice.number}</h1>
        <p className="text-sm text-olive-500">
          For <Link href={`/admin/customers/${c.id}`} className="text-olive-700 hover:underline">{c.businessName || c.name || c.email}</Link>
        </p>
      </div>

      <InvoiceEditForm
        action={`/admin/invoices/${id}/save`}
        cancelHref={`/admin/invoices/${id}`}
        number={invoice.number}
        customerName={c.businessName || c.name || c.email}
        customerRole={c.role as "CUSTOMER" | "WHOLESALE"}
        issueDate={toInput(invoice.issueDate)}
        dueDate={toInput(invoice.dueDate)}
        terms={invoice.terms ?? ""}
        poNumber={invoice.poNumber ?? ""}
        notes={invoice.notes ?? ""}
        discount={dollarsOrBlank(invoice.discountCents)}
        shipping={dollarsOrBlank(invoice.shippingCents)}
        tax={dollarsOrBlank(invoice.taxCents)}
        lines={invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents }))}
      />
    </div>
  );
}
