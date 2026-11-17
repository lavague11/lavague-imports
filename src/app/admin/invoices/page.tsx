import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { invoiceDisplay } from "@/lib/invoice";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Invoices · Admin",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
];

export default async function AdminInvoices({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const sp = await searchParams;
  const tab = firstValue(sp.status) || "all";
  const q = (firstValue(sp.q) || "").trim();

  const all = await prisma.customerInvoice.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { id: true, businessName: true, name: true, email: true } } },
  });

  const now = new Date();
  const withDisp = all.map((i) => ({ ...i, disp: invoiceDisplay(i, now) }));

  // Summary across non-void invoices.
  const live = withDisp.filter((i) => i.disp.key !== "void");
  const outstanding = live.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const overdueAmt = withDisp.filter((i) => i.disp.key === "overdue").reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const collected = live.reduce((s, i) => s + i.paidCents, 0);
  const draftCount = withDisp.filter((i) => i.disp.key === "draft").length;

  const matchesQ = (i: (typeof withDisp)[number]) => {
    if (!q) return true;
    const hay = `${i.number} ${i.customer.businessName ?? ""} ${i.customer.name ?? ""} ${i.customer.email}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  };
  const rows = withDisp.filter((i) => (tab === "all" || i.disp.key === tab) && matchesQ(i));

  const tabHref = (key: string) => {
    const p = new URLSearchParams();
    if (key !== "all") p.set("status", key);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/admin/invoices${s ? `?${s}` : ""}`;
  };

  const summary = [
    { label: "Outstanding", value: formatPrice(outstanding), danger: outstanding > 0 },
    { label: "Overdue", value: formatPrice(overdueAmt), danger: overdueAmt > 0 },
    { label: "Collected", value: formatPrice(collected) },
    { label: "Drafts", value: String(draftCount) },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-olive-900">Invoices</h1>
        <Link href="/admin/invoices/new" className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
          <Plus className="h-4 w-4" /> New invoice
        </Link>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-xl border border-olive-100 bg-white p-4">
            <p className="text-xs text-olive-500">{s.label}</p>
            <p className={`mt-1 text-lg font-semibold ${s.danger ? "text-red-700" : "text-olive-900"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <Link key={t.key} href={tabHref(t.key)} className={`rounded-full border px-2.5 py-1 text-xs ${tab === t.key ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <form action="/admin/invoices" className="flex gap-2">
          {tab !== "all" ? <input type="hidden" name="status" value={tab} /> : null}
          <input name="q" defaultValue={q} placeholder="Search number, customer…" className="h-9 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none sm:w-56" />
          <button className="h-9 rounded-lg bg-olive-900 px-3 text-sm font-medium text-white">Search</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-olive-200 bg-white p-10 text-center text-olive-500">
          {all.length === 0 ? "No invoices yet. Create one or convert an order request." : q ? `No invoices match “${q}”.` : `No ${tab} invoices.`}
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-olive-100 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
                <tr>
                  <th className="p-3">Invoice</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const balance = i.totalCents - i.paidCents;
                  const overdue = i.disp.key === "overdue";
                  return (
                    <tr key={i.id} className={`border-b border-olive-50 last:border-0 hover:bg-olive-50/40 ${overdue ? "bg-red-50/40" : ""}`}>
                      <td className="p-3 font-medium"><Link href={`/admin/invoices/${i.id}`} className="text-olive-900 hover:underline">{i.number}</Link></td>
                      <td className="p-3"><Link href={`/admin/customers/${i.customer.id}`} className="text-olive-700 hover:underline">{i.customer.businessName || i.customer.name || i.customer.email}</Link></td>
                      <td className="p-3 whitespace-nowrap text-olive-600">{dateFmt(i.issueDate)}</td>
                      <td className="p-3 text-right text-olive-800">{formatPrice(i.totalCents)}</td>
                      <td className={`p-3 text-right ${balance > 0 ? "font-medium text-olive-900" : "text-olive-400"}`}>{balance > 0 ? formatPrice(balance) : "—"}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${i.disp.badge}`}>{i.disp.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="mt-4 grid gap-3 md:hidden">
            {rows.map((i) => {
              const balance = i.totalCents - i.paidCents;
              return (
                <Link key={i.id} href={`/admin/invoices/${i.id}`} className="block rounded-xl border border-olive-100 bg-white p-4 hover:border-olive-300">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-olive-900">{i.number}</p>
                      <p className="text-sm text-olive-600">{i.customer.businessName || i.customer.name || i.customer.email}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${i.disp.badge}`}>{i.disp.label}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-olive-500">{dateFmt(i.issueDate)}</span>
                    <span className="text-olive-800">{formatPrice(i.totalCents)}{balance > 0 ? <span className="text-red-700"> · {formatPrice(balance)} due</span> : null}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
