import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { InvoicesTable, type InvoiceRow } from "@/components/admin/invoices-table";
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

const BULK: Record<string, string> = {
  archive: "Archived.",
  unarchive: "Restored.",
  delete: "Deleted.",
  error: "Couldn't complete that — try again.",
};

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
  const bulk = firstValue(sp.bulk);
  const bulkN = firstValue(sp.n);

  const all = await prisma.customerInvoice.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { id: true, businessName: true, name: true, email: true } } },
  });

  const now = new Date();
  const withDisp = all.map((i) => ({ ...i, disp: invoiceDisplay(i, now) }));

  // Summary across live (non-archived, non-void) invoices.
  const live = withDisp.filter((i) => !i.archived && i.disp.key !== "void");
  const outstanding = live.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const overdueAmt = withDisp.filter((i) => !i.archived && i.disp.key === "overdue").reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const collected = live.reduce((s, i) => s + i.paidCents, 0);
  const draftCount = withDisp.filter((i) => !i.archived && i.disp.key === "draft").length;

  const rows: InvoiceRow[] = withDisp.map((i) => ({
    id: i.id,
    number: i.number,
    customer: i.customer?.businessName || i.customer?.name || i.customer?.email || "No customer",
    customerId: i.customer?.id ?? "",
    issueISO: i.issueDate.toISOString(),
    issueLabel: dateFmt(i.issueDate),
    dueLabel: i.dueDate ? dateFmt(i.dueDate) : "",
    totalCents: i.totalCents,
    paidCents: i.paidCents,
    dispKey: i.disp.key,
    dispLabel: i.disp.label,
    dispBadge: i.disp.badge,
    archived: i.archived,
  }));

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
        <form method="post" action="/admin/invoices/create">
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
            <Plus className="h-4 w-4" /> New invoice
          </button>
        </form>
      </div>

      {bulk && BULK[bulk] ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {BULK[bulk]}{bulkN ? ` (${bulkN})` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-xl border border-olive-100 bg-white p-4">
            <p className="text-xs text-olive-500">{s.label}</p>
            <p className={`mt-1 text-lg font-semibold ${s.danger ? "text-red-700" : "text-olive-900"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <InvoicesTable rows={rows} />
      </div>
    </div>
  );
}
