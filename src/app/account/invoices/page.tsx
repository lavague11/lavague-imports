import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountHeader } from "@/components/account/account-header";
import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { invoiceDisplay } from "@/lib/invoice";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Your invoices",
  robots: { index: false, follow: false },
};

const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AccountInvoices() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account/invoices");

  const prisma = getPrisma();
  const invoices = prisma
    ? await prisma.customerInvoice.findMany({
        where: { customerId: customer.id, publicToken: { not: null } },
        orderBy: { issueDate: "desc" },
        select: { id: true, number: true, issueDate: true, dueDate: true, status: true, totalCents: true, paidCents: true, publicToken: true, signedAt: true },
      })
    : [];

  const now = new Date();
  const openBalance = invoices.filter((i) => i.status !== "VOID").reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);

  return (
    <Container className="py-12 lg:py-16">
      <AccountHeader name={customer.name} email={customer.email} isWholesale={customer.role === "WHOLESALE"} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-olive-900">Invoices</h2>
        {openBalance > 0 ? (
          <p className="text-sm text-olive-600">Open balance <span className="font-semibold text-red-700">{formatPrice(openBalance)}</span></p>
        ) : null}
      </div>

      {invoices.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-olive-200 bg-white p-10 text-center text-olive-500">
          You have no invoices yet. We&apos;ll email you when one is ready, and it will appear here.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-card border border-olive-100 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
              <tr>
                <th className="p-3">Invoice</th>
                <th className="p-3">Issued</th>
                <th className="p-3">Due</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const disp = invoiceDisplay(i, now);
                const balance = i.totalCents - i.paidCents;
                const overdue = disp.key === "overdue";
                return (
                  <tr key={i.id} className={`border-b border-olive-50 last:border-0 hover:bg-olive-50/40 ${overdue ? "bg-red-50/40" : ""}`}>
                    <td className="p-3 font-medium">
                      {i.publicToken ? <Link href={`/invoice/${i.publicToken}`} className="text-olive-900 hover:underline">{i.number}</Link> : i.number}
                    </td>
                    <td className="p-3 whitespace-nowrap text-olive-500">{dateFmt(i.issueDate)}</td>
                    <td className={`p-3 whitespace-nowrap ${overdue ? "font-medium text-red-700" : "text-olive-500"}`}>{i.dueDate ? dateFmt(i.dueDate) : "—"}</td>
                    <td className="p-3 text-right text-olive-800">{formatPrice(i.totalCents)}</td>
                    <td className={`p-3 text-right ${balance > 0 ? "font-medium text-olive-900" : "text-olive-400"}`}>{balance > 0 ? formatPrice(balance) : "—"}</td>
                    <td className="p-3 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${disp.badge}`}>{disp.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-olive-500">Click an invoice to view it, download the PDF, accept it, or see payment instructions.</p>
    </Container>
  );
}
