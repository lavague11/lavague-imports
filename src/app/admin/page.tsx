import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Phone, MessageSquare, Bell } from "lucide-react";

import { DateRangePicker } from "@/components/admin/date-range-picker";
import { getCurrentUser } from "@/lib/auth";
import { rangeWindow } from "@/lib/admin/range";
import { getPrisma } from "@/lib/db";
import { getGoogleUser } from "@/lib/google-session";
import { paymentMethodLabel } from "@/lib/invoice";
import { formatPrice } from "@/lib/utils";

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const day = 864e5;
const daysLate = (due: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - due.getTime()) / day));
const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const pct = (cur: number, prev: number) => (prev <= 0 ? null : Math.round(((cur - prev) / prev) * 100));

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-olive-100 text-olive-600" },
  SENT: { label: "Open", cls: "bg-sky-100 text-sky-800" },
  PARTIAL: { label: "Partial", cls: "bg-amber-100 text-amber-800" },
  PAID: { label: "Paid", cls: "bg-emerald-100 text-emerald-700" },
  VOID: { label: "Void", cls: "bg-olive-100 text-olive-500" },
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    const google = await getGoogleUser();
    redirect(google ? "/admin/login?error=not-allowed" : "/admin/login");
  }

  // Stage 2: the page is driven by a `view` (defaults to wholesale) so a second
  // view can be added later as new section content without a rebuild.
  const sp = await searchParams;
  const view = firstValue(sp.view) === "ecommerce" ? "ecommerce" : "wholesale";

  const prisma = getPrisma();
  if (!prisma) {
    return (
      <div>
        <h1 className="font-display text-2xl text-olive-900">Dashboard</h1>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Database offline</strong> — the dashboard needs <code>DATABASE_URL</code> connected.
        </div>
      </div>
    );
  }

  const now = new Date();
  const rangeKey = firstValue(sp.range) ?? "month";
  const win = rangeWindow(rangeKey, firstValue(sp.from), firstValue(sp.to), now);
  const liveWhere = { archived: false, status: { not: "VOID" as const } };

  const [
    openInvoices, collectedCur, collectedPrev, avgCur, avgPrev,
    orderRequests, needsReviewCount,
    recentInvoices, recentPayments, newCustomers,
    missingImage, custom, overrides, drafts,
  ] = await Promise.all([
    prisma.customerInvoice.findMany({
      where: { ...liveWhere, totalCents: { gt: prisma.customerInvoice.fields.paidCents } },
      select: { id: true, number: true, externalNumber: true, totalCents: true, paidCents: true, dueDate: true, customer: { select: { businessName: true, name: true, phone: true } } },
    }),
    prisma.customerPayment.aggregate({ _sum: { amountCents: true }, where: { receivedAt: { gte: win.start, lte: win.end } } }),
    prisma.customerPayment.aggregate({ _sum: { amountCents: true }, where: { receivedAt: { gte: win.prevStart, lt: win.prevEnd } } }),
    prisma.customerInvoice.aggregate({ _avg: { totalCents: true }, _count: { _all: true }, where: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.start, lte: win.end } } }),
    prisma.customerInvoice.aggregate({ _avg: { totalCents: true }, where: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.prevStart, lt: win.prevEnd } } }),
    prisma.orderRequest.findMany({ where: { status: "SUBMITTED" }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, reference: true, createdAt: true, customer: { select: { businessName: true, name: true } } } }),
    prisma.product.count({ where: { needsReview: true } }),
    prisma.customerInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, externalNumber: true, totalCents: true, status: true, customer: { select: { businessName: true, name: true } } } }),
    prisma.customerPayment.findMany({ orderBy: { receivedAt: "desc" }, take: 10, select: { id: true, amountCents: true, method: true, receivedAt: true, invoice: { select: { customer: { select: { businessName: true, name: true } } } } } }),
    prisma.customer.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, businessName: true, name: true, createdAt: true } }),
    prisma.product.count({ where: { imageUrl: null } }),
    prisma.product.count({ where: { isCustom: true } }),
    prisma.productOverride.count(),
    prisma.productOverride.count({ where: { draftUpdatedAt: { not: null } } }),
  ]);

  // Money + aging from the open invoices.
  const outstanding = openInvoices.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const overdueList = openInvoices
    .filter((i) => i.dueDate && i.dueDate < now)
    .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()));
  const overdue = overdueList.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const aging = { b1: 0, b2: 0, b3: 0 };
  for (const i of overdueList) {
    const dl = daysLate(i.dueDate!, now);
    const bal = i.totalCents - i.paidCents;
    if (dl <= 30) aging.b1 += bal; else if (dl <= 60) aging.b2 += bal; else aging.b3 += bal;
  }
  const collected = collectedCur._sum.amountCents ?? 0;
  const collectedPrevVal = collectedPrev._sum.amountCents ?? 0;
  const collectedPct = pct(collected, collectedPrevVal);
  const avgOrder = Math.round(avgCur._avg?.totalCents ?? 0);
  const avgPct = pct(avgOrder, Math.round(avgPrev._avg?.totalCents ?? 0));
  const avgCount = avgCur._count?._all ?? 0;

  const custName = (c: { businessName: string | null; name: string | null } | null) => c?.businessName || c?.name || "No customer";

  const money = [
    { label: "Outstanding", value: formatPrice(outstanding), href: "/admin/invoices?tab=open", danger: outstanding > 0, sub: `${openInvoices.length} open` },
    { label: "Overdue", value: formatPrice(overdue), href: "/admin/invoices?tab=overdue", danger: overdue > 0, sub: `1–30 ${formatPrice(aging.b1)} · 31–60 ${formatPrice(aging.b2)} · 61+ ${formatPrice(aging.b3)}` },
    { label: `Collected · ${win.label}`, value: formatPrice(collected), href: "/admin/invoices?tab=paid", sub: collectedPct == null ? "vs prev period" : `${collectedPct >= 0 ? "+" : ""}${collectedPct}% vs prev period` },
    { label: "Average order", value: formatPrice(avgOrder), href: "/admin/invoices", sub: avgPct == null ? `${avgCount} invoices` : `${avgPct >= 0 ? "+" : ""}${avgPct}% · ${avgCount} inv` },
  ];

  const needsYou = overdueList.length > 0 || orderRequests.length > 0 || needsReviewCount > 0;

  const health = [
    { label: "Missing image", value: missingImage, href: "/admin/products?filter=missing-image" },
    { label: "Needs review", value: needsReviewCount, href: "/admin/products?filter=needs-review" },
    { label: "Custom", value: custom, href: "/admin/products?filter=custom" },
    { label: "Edited by hand", value: overrides, href: "/admin/products" },
    { label: "Unpublished", value: drafts, href: "/admin/products" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-olive-900">Dashboard</h1>
          <p className="mt-1 text-sm text-olive-600">Wholesale · welcome back, {user.name ?? user.email}.</p>
        </div>
        <form method="post" action="/admin/invoices/create">
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-olive-800">
            <FilePlus2 className="h-4 w-4" /> New invoice
          </button>
        </form>
      </div>

      {view === "wholesale" ? (
        <div className="mt-4">
          <DateRangePicker current={rangeKey} from={firstValue(sp.from)} to={firstValue(sp.to)} />
        </div>
      ) : null}

      {view === "wholesale" ? (
        <>
          {/* Money row */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {money.map((m) => (
              <Link key={m.label} href={m.href} className="rounded-xl border border-olive-100 bg-white p-4 transition-colors hover:border-olive-300">
                <p className="text-xs text-olive-500">{m.label}</p>
                <p className={`mt-1 text-xl font-semibold ${m.danger ? "text-red-700" : "text-olive-900"}`}>{m.value}</p>
                <p className="mt-1 text-[11px] text-olive-400">{m.sub}</p>
              </Link>
            ))}
          </div>

          {/* Needs you */}
          {needsYou ? (
            <section className="mt-6">
              <h2 className="mb-2 font-display text-lg text-olive-900">Needs you</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {overdueList.length ? (
                  <div className="rounded-xl border border-olive-100 bg-white">
                    <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">Overdue invoices</p>
                    <ul className="divide-y divide-olive-50">
                      {overdueList.slice(0, 6).map((i) => {
                        const bal = i.totalCents - i.paidCents;
                        const phone = i.customer?.phone;
                        return (
                          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                            <Link href={`/admin/invoices/${i.id}`} className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-olive-900">{custName(i.customer)}</p>
                              <p className="text-xs text-olive-500">{i.externalNumber || i.number}{i.externalNumber ? ` · ${i.number}` : ""} · {daysLate(i.dueDate!, now)}d late</p>
                            </Link>
                            <span className="shrink-0 text-sm font-medium text-red-700">{formatPrice(bal)}</span>
                            <span className="flex shrink-0 items-center gap-1">
                              {phone ? <a href={`tel:${phone}`} aria-label="Call" className="rounded-full p-1.5 text-olive-500 hover:bg-olive-50"><Phone className="h-4 w-4" /></a> : null}
                              {phone ? <a href={`sms:${phone}`} aria-label="Text" className="rounded-full p-1.5 text-olive-500 hover:bg-olive-50"><MessageSquare className="h-4 w-4" /></a> : null}
                              <Link href={`/admin/invoices/${i.id}`} aria-label="Remind" className="rounded-full p-1.5 text-olive-500 hover:bg-olive-50"><Bell className="h-4 w-4" /></Link>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <div className="space-y-4">
                  {orderRequests.length ? (
                    <div className="rounded-xl border border-olive-100 bg-white">
                      <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">New order requests</p>
                      <ul className="divide-y divide-olive-50">
                        {orderRequests.map((o) => (
                          <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                            <span className="min-w-0"><span className="font-medium text-olive-900">{custName(o.customer)}</span> <span className="text-olive-400">· {o.reference}</span></span>
                            <span className="text-xs text-olive-500">{dateFmt(o.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {needsReviewCount ? (
                    <Link href="/admin/products?filter=needs-review" className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100">
                      <span className="font-semibold">{needsReviewCount}</span> product{needsReviewCount === 1 ? "" : "s"} marked “Needs review” →
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {/* Activity */}
          <section className="mt-6">
            <h2 className="mb-2 font-display text-lg text-olive-900">Activity</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-olive-100 bg-white">
                <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">Recent invoices</p>
                <ul className="divide-y divide-olive-50">
                  {recentInvoices.map((i) => {
                    const b = STATUS_BADGE[i.status] ?? STATUS_BADGE.SENT;
                    return (
                      <li key={i.id} className="px-4 py-2">
                        <Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate text-olive-800">{custName(i.customer)}</span>
                          <span className="flex shrink-0 items-center gap-2"><span className="text-olive-600">{formatPrice(i.totalCents)}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}>{b.label}</span></span>
                        </Link>
                      </li>
                    );
                  })}
                  {recentInvoices.length === 0 ? <li className="px-4 py-3 text-sm text-olive-400">None yet.</li> : null}
                </ul>
              </div>
              <div className="rounded-xl border border-olive-100 bg-white">
                <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">Recent payments</p>
                <ul className="divide-y divide-olive-50">
                  {recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span className="min-w-0 truncate text-olive-800">{custName(p.invoice?.customer ?? null)}</span>
                      <span className="flex shrink-0 items-center gap-2"><span className="font-medium text-emerald-700">{formatPrice(p.amountCents)}</span><span className="text-[10px] text-olive-400">{paymentMethodLabel(p.method)}</span></span>
                    </li>
                  ))}
                  {recentPayments.length === 0 ? <li className="px-4 py-3 text-sm text-olive-400">None yet.</li> : null}
                </ul>
              </div>
              <div className="rounded-xl border border-olive-100 bg-white">
                <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">Newest customers</p>
                <ul className="divide-y divide-olive-50">
                  {newCustomers.map((c) => (
                    <li key={c.id} className="px-4 py-2">
                      <Link href={`/admin/customers/${c.id}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-olive-800">{custName(c)}</span>
                        <span className="shrink-0 text-xs text-olive-400">{dateFmt(c.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                  {newCustomers.length === 0 ? <li className="px-4 py-3 text-sm text-olive-400">None yet.</li> : null}
                </ul>
              </div>
            </div>
          </section>

          {/* Catalog health strip */}
          <section className="mt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-olive-100 bg-white px-4 py-3 text-sm">
              <span className="text-xs font-semibold tracking-wide text-olive-400 uppercase">Catalog</span>
              {health.map((h) => (
                <Link key={h.label} href={h.href} className="inline-flex items-center gap-1.5 text-olive-600 hover:text-olive-900">
                  <span className="font-semibold text-olive-900">{h.value}</span> {h.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
