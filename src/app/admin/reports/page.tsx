import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { invoiceDisplay } from "@/lib/invoice";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Reports · Admin",
  robots: { index: false, follow: false },
};

const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const DAY = 86_400_000;

export default async function Reports() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const now = new Date();
  const [invoices, recentPayments] = await Promise.all([
    prisma.customerInvoice.findMany({
      include: { customer: { select: { id: true, businessName: true, name: true, email: true } } },
    }),
    prisma.customerPayment.findMany({
      orderBy: { receivedAt: "desc" },
      take: 10,
      include: { invoice: { select: { id: true, number: true, customer: { select: { id: true, businessName: true, name: true, email: true } } } } },
    }),
  ]);

  const live = invoices.filter((i) => i.status !== "VOID");
  const invoiced = live.reduce((s, i) => s + i.totalCents, 0);
  const collected = live.reduce((s, i) => s + i.paidCents, 0);
  const outstanding = live.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);

  // A/R aging buckets by balance past due.
  const aging = { current: 0, b1: 0, b2: 0, b3: 0 };
  for (const i of live) {
    const bal = i.totalCents - i.paidCents;
    if (bal <= 0) continue;
    if (!i.dueDate || i.dueDate >= now) {
      aging.current += bal;
      continue;
    }
    const days = Math.floor((now.getTime() - i.dueDate.getTime()) / DAY);
    if (days <= 30) aging.b1 += bal;
    else if (days <= 60) aging.b2 += bal;
    else aging.b3 += bal;
  }
  const overdueTotal = aging.b1 + aging.b2 + aging.b3;

  // Top customers by amount collected.
  const byCustomer = new Map<string, { name: string; id: string; paid: number; outstanding: number }>();
  for (const i of live) {
    const key = i.customer.id;
    const entry = byCustomer.get(key) ?? {
      id: i.customer.id,
      name: i.customer.businessName || i.customer.name || i.customer.email,
      paid: 0,
      outstanding: 0,
    };
    entry.paid += i.paidCents;
    entry.outstanding += Math.max(0, i.totalCents - i.paidCents);
    byCustomer.set(key, entry);
  }
  const topCustomers = [...byCustomer.values()].sort((a, b) => b.paid - a.paid).slice(0, 8).filter((c) => c.paid > 0 || c.outstanding > 0);

  const summary = [
    { label: "Invoiced", value: formatPrice(invoiced) },
    { label: "Collected", value: formatPrice(collected) },
    { label: "Outstanding", value: formatPrice(outstanding), danger: outstanding > 0 },
    { label: "Overdue", value: formatPrice(overdueTotal), danger: overdueTotal > 0 },
  ];

  const agingRows = [
    { label: "Current", value: aging.current },
    { label: "1–30 days", value: aging.b1 },
    { label: "31–60 days", value: aging.b2 },
    { label: "61+ days", value: aging.b3, danger: true },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl text-olive-900">Reports</h1>
      <p className="mt-1 text-sm text-olive-500">Accounts receivable across all customer invoices.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-xl border border-olive-100 bg-white p-4">
            <p className="text-xs text-olive-500">{s.label}</p>
            <p className={`mt-1 text-lg font-semibold ${s.danger ? "text-red-700" : "text-olive-900"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Aging */}
        <section className="rounded-xl border border-olive-100 bg-white p-5">
          <h2 className="font-display text-lg text-olive-900">A/R aging</h2>
          <div className="mt-3 space-y-2 text-sm">
            {agingRows.map((r) => {
              const pct = outstanding > 0 ? Math.round((r.value / outstanding) * 100) : 0;
              return (
                <div key={r.label}>
                  <div className="flex items-center justify-between">
                    <span className="text-olive-600">{r.label}</span>
                    <span className={r.danger && r.value > 0 ? "font-medium text-red-700" : "text-olive-800"}>{formatPrice(r.value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-olive-100">
                    <div className={`h-full ${r.danger ? "bg-red-400" : "bg-olive-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top customers */}
        <section className="rounded-xl border border-olive-100 bg-white p-5">
          <h2 className="font-display text-lg text-olive-900">Top customers</h2>
          {topCustomers.length === 0 ? (
            <p className="mt-3 text-sm text-olive-500">No invoiced customers yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {topCustomers.map((c) => (
                  <tr key={c.id} className="border-b border-olive-50 last:border-0">
                    <td className="py-2"><Link href={`/admin/customers/${c.id}`} className="text-olive-800 hover:underline">{c.name}</Link></td>
                    <td className="py-2 text-right text-olive-800">{formatPrice(c.paid)}</td>
                    <td className="py-2 text-right text-olive-400">{c.outstanding > 0 ? `${formatPrice(c.outstanding)} due` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Recent payments */}
      <section className="mt-6">
        <h2 className="font-display text-lg text-olive-900">Recent payments</h2>
        {recentPayments.length === 0 ? (
          <p className="mt-2 text-sm text-olive-500">No payments recorded yet.</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-xl border border-olive-100 bg-white">
            <table className="w-full text-sm">
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id} className="border-b border-olive-50 last:border-0">
                    <td className="p-3 whitespace-nowrap text-olive-600">{dateFmt(p.receivedAt)}</td>
                    <td className="p-3"><Link href={`/admin/customers/${p.invoice.customer.id}`} className="text-olive-700 hover:underline">{p.invoice.customer.businessName || p.invoice.customer.name || p.invoice.customer.email}</Link></td>
                    <td className="p-3"><Link href={`/admin/invoices/${p.invoice.id}`} className="text-olive-500 hover:underline">{p.invoice.number}</Link></td>
                    <td className="p-3 text-right font-medium text-olive-900">{formatPrice(p.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
