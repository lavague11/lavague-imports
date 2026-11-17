import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { composeAddress } from "@/lib/address";
import { getPrisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Invoice · Admin",
  robots: { index: false, follow: false },
};

const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const { id } = await params;
  const invoice = await prisma.customerInvoice.findUnique({
    where: { id },
    include: { customer: true, lines: true },
  });
  if (!invoice) notFound();

  const balance = invoice.totalCents - invoice.paidCents;
  const now = new Date();
  const status =
    invoice.status === "VOID" ? "Void"
      : balance <= 0 && invoice.totalCents > 0 ? "Paid"
      : invoice.dueDate && invoice.dueDate < now && balance > 0 ? "Overdue"
      : invoice.paidCents > 0 ? "Partial"
      : "Open";
  const badge: Record<string, string> = {
    Paid: "bg-emerald-100 text-emerald-700",
    Overdue: "bg-red-100 text-red-700",
    Partial: "bg-amber-100 text-amber-800",
    Open: "bg-sky-100 text-sky-800",
    Void: "bg-olive-100 text-olive-500",
  };
  const c = invoice.customer;
  const addr = composeAddress(c);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/admin/customers/${c.id}`} className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to {c.businessName || c.name || "customer"}
      </Link>

      <div className="mt-3 rounded-xl border border-olive-100 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-olive-900">{invoice.number}</h1>
            <p className="mt-1 text-sm text-olive-500">
              Issued {dateFmt(invoice.issueDate)}
              {invoice.dueDate ? ` · due ${dateFmt(invoice.dueDate)}` : ""}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge[status]}`}>{status}</span>
        </div>

        <div className="mt-4 text-sm">
          <p className="font-medium text-olive-900">{c.businessName || c.name || c.email}</p>
          {c.name && c.businessName ? <p className="text-olive-600">{c.name}</p> : null}
          <p className="text-olive-600">{c.email}</p>
          {addr ? <p className="text-olive-500">{addr}</p> : null}
        </div>

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
          {balance > 0 ? <Row label="Balance due" value={formatPrice(balance)} bold /> : null}
        </div>

        <p className="mt-6 text-xs text-olive-400">
          PDF, e-signature and payments arrive with the full invoicing module (Section M).
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-olive-900" : "text-olive-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
