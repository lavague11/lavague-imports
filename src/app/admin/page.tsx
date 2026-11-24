import Link from "next/link";
import { redirect } from "next/navigation";
import { Phone, MessageSquare, Bell, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { CatalogDownload } from "@/components/admin/catalog-download";
import { DashboardCustomize } from "@/components/admin/dashboard-customize";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { NewMenu } from "@/components/admin/new-menu";
import { GoalCard } from "@/components/admin/goal-card";
import { SalesTrendChart } from "@/components/admin/sales-trend-chart";
import { getCountryFilters } from "@/lib/catalog";
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

interface TopItem { sku: string; product: { slug: string; name: string; imageUrl: string | null } | null; label: string; trend: "up" | "down" | "flat" }
function TopList({ title, items }: { title: string; items: TopItem[] }) {
  return (
    <div className="rounded-xl border border-olive-100 bg-white">
      <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">{title}</p>
      <ul className="divide-y divide-olive-50">
        {items.length === 0 ? <li className="px-4 py-3 text-sm text-olive-400">No sales in this period.</li> : null}
        {items.map((t) => {
          const Icon = t.trend === "up" ? TrendingUp : t.trend === "down" ? TrendingDown : Minus;
          const cls = t.trend === "up" ? "text-emerald-600" : t.trend === "down" ? "text-red-500" : "text-olive-300";
          const row = (
            <span className="flex items-center gap-3">
              {t.product?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.product.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-contain" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-olive-50 text-[9px] text-olive-400">—</span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-olive-800">{t.product?.name ?? t.sku}</span>
              <span className="shrink-0 text-sm font-medium text-olive-900">{t.label}</span>
              <Icon className={`h-4 w-4 shrink-0 ${cls}`} />
            </span>
          );
          return (
            <li key={t.sku} className="px-4 py-2">
              {t.product ? <Link href={`/admin/products/${t.product.slug}`}>{row}</Link> : row}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
    trendCur, trendPrev, linesCur, linesPrev, topCustAgg, allCustInv, repAgg, dtpPayments, availWatch,
    monthRevAgg, goalRow,
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
    prisma.customerInvoice.findMany({ where: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.start, lte: win.end } }, select: { issueDate: true, totalCents: true } }),
    prisma.customerInvoice.findMany({ where: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.prevStart, lt: win.prevEnd } }, select: { issueDate: true, totalCents: true } }),
    prisma.customerInvoiceLine.groupBy({ by: ["sku"], where: { isCredit: false, sku: { not: null }, invoice: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.start, lte: win.end } } }, _sum: { lineTotalCents: true, quantity: true } }),
    prisma.customerInvoiceLine.groupBy({ by: ["sku"], where: { isCredit: false, sku: { not: null }, invoice: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.prevStart, lt: win.prevEnd } } }, _sum: { lineTotalCents: true } }),
    prisma.customerInvoice.groupBy({ by: ["customerId"], where: { customerId: { not: null }, status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.start, lte: win.end } }, _sum: { totalCents: true } }),
    prisma.customerInvoice.findMany({ where: { customerId: { not: null }, status: { in: ["SENT", "PARTIAL", "PAID"] } }, select: { customerId: true, issueDate: true } }),
    prisma.customerInvoice.groupBy({ by: ["salesRep"], where: { salesRep: { not: null }, status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: win.start, lte: win.end } }, _sum: { totalCents: true }, _count: { _all: true } }),
    prisma.customerPayment.findMany({ select: { receivedAt: true, invoice: { select: { issueDate: true } } } }),
    prisma.product.findMany({ where: { availability: { in: ["LIMITED", "UNAVAILABLE"] } }, orderBy: [{ availability: "desc" }, { name: "asc" }], take: 12, select: { slug: true, name: true, supplier: true, leadTimeDays: true, availability: true } }),
    prisma.customerInvoice.aggregate({ _sum: { totalCents: true }, where: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
    prisma.numberSeries.findUnique({ where: { key: "monthly_revenue_goal_cents" }, select: { value: true } }),
  ]);
  const monthRevenue = monthRevAgg._sum.totalCents ?? 0;
  const monthlyGoal = goalRow?.value ?? 0;
  // Countries for the "Download catalog" modal (same list the storefront uses).
  const catalogCountries = (await getCountryFilters()).map((c) => ({ slug: c.slug, name: c.name, count: c.count }));
  const rangeQS = `range=${rangeKey}${firstValue(sp.from) ? `&from=${firstValue(sp.from)}` : ""}${firstValue(sp.to) ? `&to=${firstValue(sp.to)}` : ""}`;
  const exportHref = (card: string) => `/admin/dashboard/export?card=${card}&${rangeQS}`;

  // A/R from the open invoices.
  const outstanding = openInvoices.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const overdueList = openInvoices
    .filter((i) => i.dueDate && i.dueDate < now)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const overdue = overdueList.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const aging = { b1: 0, b2: 0, b3: 0 };
  for (const i of overdueList) {
    const dl = daysLate(i.dueDate!, now);
    const bal = i.totalCents - i.paidCents;
    if (dl <= 30) aging.b1 += bal; else if (dl <= 60) aging.b2 += bal; else aging.b3 += bal;
  }

  // Collections — full A/R aging (adds the "current" bucket), avg days to pay,
  // and the biggest open balances.
  let arCurrent = 0;
  for (const i of openInvoices) { const bal = i.totalCents - i.paidCents; if (!i.dueDate || i.dueDate >= now) arCurrent += bal; }
  const arBuckets = [
    { label: "Current", v: arCurrent, cls: "bg-emerald-400" },
    { label: "1–30", v: aging.b1, cls: "bg-amber-300" },
    { label: "31–60", v: aging.b2, cls: "bg-orange-400" },
    { label: "61+", v: aging.b3, cls: "bg-red-500" },
  ];
  const arTotal = Math.max(1, arCurrent + aging.b1 + aging.b2 + aging.b3);
  const dtpDays = dtpPayments
    .map((p) => (p.invoice ? (p.receivedAt.getTime() - p.invoice.issueDate.getTime()) / day : null))
    .filter((d): d is number => d != null && d >= 0);
  const avgDaysToPay = dtpDays.length ? Math.round(dtpDays.reduce((s, d) => s + d, 0) / dtpDays.length) : null;
  const biggestBalances = [...openInvoices].sort((a, b) => (b.totalCents - b.paidCents) - (a.totalCents - a.paidCents)).slice(0, 6);

  const reps = repAgg
    .filter((r) => r.salesRep && r.salesRep.trim())
    .map((r) => ({ name: r.salesRep as string, revenue: r._sum.totalCents ?? 0, count: r._count._all }))
    .sort((a, b) => b.revenue - a.revenue);

  // Top customers (by revenue in range) + at-risk ("haven't ordered lately").
  const topCustRows = topCustAgg.filter((r) => r.customerId).sort((a, b) => (b._sum.totalCents ?? 0) - (a._sum.totalCents ?? 0)).slice(0, 10);
  const cadence = new Map<string, number[]>();
  for (const inv of allCustInv) {
    if (!inv.customerId) continue;
    const arr = cadence.get(inv.customerId) ?? [];
    arr.push(inv.issueDate.getTime());
    cadence.set(inv.customerId, arr);
  }
  const atRisk: { cid: string; avgGap: number; sinceLast: number; overdue: number }[] = [];
  for (const [cid, times] of cadence) {
    if (times.length < 3) continue;
    times.sort((a, b) => a - b);
    const avgGap = (times[times.length - 1] - times[0]) / (times.length - 1) / day;
    const sinceLast = (now.getTime() - times[times.length - 1]) / day;
    if (sinceLast > Math.max(avgGap * 1.75, avgGap + 14) && sinceLast > 30) atRisk.push({ cid, avgGap: Math.round(avgGap), sinceLast: Math.round(sinceLast), overdue: sinceLast - avgGap });
  }
  atRisk.sort((a, b) => b.overdue - a.overdue);
  const atRiskTop = atRisk.slice(0, 8);
  const custIds = [...new Set([...topCustRows.map((r) => r.customerId as string), ...atRiskTop.map((r) => r.cid)])];
  const custRows = custIds.length ? await prisma.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, businessName: true, name: true, phone: true } }) : [];
  const custById = new Map(custRows.map((c) => [c.id, c]));
  const topCustomers = topCustRows.map((r) => ({ cust: custById.get(r.customerId as string) ?? null, amount: r._sum.totalCents ?? 0 }));
  const atRiskCustomers = atRiskTop.map((r) => ({ cust: custById.get(r.cid) ?? null, sinceLast: r.sinceLast, avgGap: r.avgGap }));

  // Top products (by revenue and cases) with a trend vs the previous period.
  const sumRev = new Map<string, number>();
  const sumCases = new Map<string, number>();
  for (const r of linesCur) { if (!r.sku) continue; sumRev.set(r.sku, r._sum.lineTotalCents ?? 0); sumCases.set(r.sku, r._sum.quantity ?? 0); }
  const prevRev = new Map(linesPrev.filter((r) => r.sku).map((r) => [r.sku as string, r._sum.lineTotalCents ?? 0]));
  const byRevenueSkus = [...sumRev.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byCasesSkus = [...sumCases.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topSkus = [...new Set([...byRevenueSkus, ...byCasesSkus].map(([s]) => s))];
  const topVariants = topSkus.length
    ? await prisma.productVariant.findMany({ where: { sku: { in: topSkus } }, select: { sku: true, product: { select: { slug: true, name: true, imageUrl: true } } } })
    : [];
  const prodBySku = new Map(topVariants.map((v) => [v.sku, v.product]));
  const trendOf = (sku: string, cur: number): "up" | "down" | "flat" => {
    const p = prevRev.get(sku) ?? 0;
    if (cur > p * 1.05) return "up";
    if (p > 0 && cur < p * 0.95) return "down";
    return "flat";
  };
  const topRevenue = byRevenueSkus.map(([sku, rev]) => ({ sku, product: prodBySku.get(sku) ?? null, label: formatPrice(rev), trend: trendOf(sku, rev) }));
  const topCases = byCasesSkus.map(([sku, cases]) => ({ sku, product: prodBySku.get(sku) ?? null, label: `${cases} cases`, trend: trendOf(sku, sumRev.get(sku) ?? 0) }));

  // Revenue trend buckets (equal time slices; current vs previous period).
  const N = 12;
  const bucketize = (invs: { issueDate: Date; totalCents: number }[], s: Date, e: Date) => {
    const len = Math.max(1, (e.getTime() - s.getTime()) / N);
    const vals = new Array(N).fill(0);
    for (const inv of invs) {
      let idx = Math.floor((inv.issueDate.getTime() - s.getTime()) / len);
      if (idx < 0) idx = 0; if (idx >= N) idx = N - 1;
      vals[idx] += inv.totalCents;
    }
    return vals as number[];
  };
  const curVals = bucketize(trendCur, win.start, win.end);
  const prevVals = bucketize(trendPrev, win.prevStart, win.prevEnd);
  const sliceLen = (win.end.getTime() - win.start.getTime()) / N;
  const rangeDays = (win.end.getTime() - win.start.getTime()) / day;
  const fmtBucket = (i: number) => {
    const d = new Date(win.start.getTime() + i * sliceLen);
    if (rangeDays <= 2) return d.toLocaleTimeString("en-US", { hour: "numeric" });
    if (rangeDays > 200) return d.toLocaleDateString("en-US", { month: "short" });
    return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  };
  const trendPoints = curVals.map((v, i) => ({ label: fmtBucket(i), value: v, prev: prevVals[i] ?? 0 }));

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
        <NewMenu />
      </div>

      {view === "wholesale" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <DateRangePicker current={rangeKey} from={firstValue(sp.from)} to={firstValue(sp.to)} />
            <div className="flex flex-wrap gap-2 text-sm">
              <CatalogDownload countries={catalogCountries} />
              <Link href="/admin/invoices" className="rounded-lg border border-olive-200 bg-white px-3 py-1.5 font-medium text-olive-700 hover:bg-olive-50">Record payment</Link>
              <Link href="/admin/products/new" className="rounded-lg border border-olive-200 bg-white px-3 py-1.5 font-medium text-olive-700 hover:bg-olive-50">Add product</Link>
              <Link href="/admin/customers" className="rounded-lg border border-olive-200 bg-white px-3 py-1.5 font-medium text-olive-700 hover:bg-olive-50">Add customer</Link>
              <DashboardCustomize />
            </div>
          </div>
        </>
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

          {/* Goal + sales trend */}
          <div data-dash-section="goal-trend" className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
            <GoalCard current={monthRevenue} goal={monthlyGoal} />
            <SalesTrendChart points={trendPoints} periodLabel={win.label} />
          </div>

          {/* Top products */}
          {topRevenue.length || topCases.length ? (
            <section data-dash-section="top-products" className="mt-6">
              <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-lg text-olive-900">Top products · {win.label}</h2><a href={exportHref("top-products")} className="text-xs text-olive-500 underline hover:text-olive-800">Export CSV</a></div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TopList title="By revenue" items={topRevenue} />
                <TopList title="By cases sold" items={topCases} />
              </div>
            </section>
          ) : null}

          {/* Top customers + at-risk */}
          {topCustomers.length || atRiskCustomers.length ? (
            <section data-dash-section="customers" className="mt-6">
              <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-lg text-olive-900">Customers</h2><a href={exportHref("top-customers")} className="text-xs text-olive-500 underline hover:text-olive-800">Export CSV</a></div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-olive-100 bg-white">
                  <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">Top customers · {win.label}</p>
                  <ul className="divide-y divide-olive-50">
                    {topCustomers.length === 0 ? <li className="px-4 py-3 text-sm text-olive-400">No sales in this period.</li> : null}
                    {topCustomers.map((t, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                        <span className="min-w-0 truncate text-olive-800">{custName(t.cust)}</span>
                        <span className="shrink-0 font-medium text-olive-900">{formatPrice(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-olive-100 bg-white">
                  <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">Haven&apos;t ordered lately</p>
                  <ul className="divide-y divide-olive-50">
                    {atRiskCustomers.length === 0 ? <li className="px-4 py-3 text-sm text-olive-400">Everyone&apos;s on schedule.</li> : null}
                    {atRiskCustomers.map((a, i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-olive-900">{custName(a.cust)}</span>
                          <span className="text-xs text-olive-500">{a.sinceLast}d since last · usually every {a.avgGap}d</span>
                        </span>
                        {a.cust?.phone ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <a href={`tel:${a.cust.phone}`} aria-label="Call" className="rounded-full p-1.5 text-olive-500 hover:bg-olive-50"><Phone className="h-4 w-4" /></a>
                            <a href={`sms:${a.cust.phone}`} aria-label="Text" className="rounded-full p-1.5 text-olive-500 hover:bg-olive-50"><MessageSquare className="h-4 w-4" /></a>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          {/* Needs you */}
          {needsYou ? (
            <section data-dash-section="needs-you" className="mt-6">
              <h2 className="mb-2 font-display text-lg text-olive-900">Needs you</h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

          {/* Collections */}
          {outstanding > 0 ? (
            <section data-dash-section="collections" className="mt-6">
              <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-lg text-olive-900">Collections</h2><a href={exportHref("biggest-balances")} className="text-xs text-olive-500 underline hover:text-olive-800">Export CSV</a></div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-olive-100 bg-white p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-olive-800">A/R aging</span>
                    <span className="text-olive-500">avg {avgDaysToPay ?? "—"} days to get paid</span>
                  </div>
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-olive-50">
                    {arBuckets.map((b) => (b.v > 0 ? <div key={b.label} className={b.cls} style={{ width: `${(b.v / arTotal) * 100}%` }} title={`${b.label}: ${formatPrice(b.v)}`} /> : null))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    {arBuckets.map((b) => (
                      <span key={b.label} className="inline-flex items-center gap-1.5 text-olive-600">
                        <span className={`inline-block h-2 w-2 rounded-full ${b.cls}`} /> {b.label} {formatPrice(b.v)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-olive-100 bg-white">
                  <p className="border-b border-olive-50 px-4 py-2.5 text-sm font-medium text-olive-800">Biggest balances</p>
                  <ul className="divide-y divide-olive-50">
                    {biggestBalances.map((i) => {
                      const bal = i.totalCents - i.paidCents;
                      const late = i.dueDate && i.dueDate < now ? `${daysLate(i.dueDate, now)}d late` : "current";
                      return (
                        <li key={i.id} className="px-4 py-2">
                          <Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0"><span className="truncate font-medium text-olive-900">{custName(i.customer)}</span> <span className="text-xs text-olive-400">· {late}</span></span>
                            <span className="shrink-0 font-medium text-olive-900">{formatPrice(bal)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          {/* Availability — re-check with supplier */}
          {availWatch.length ? (
            <section data-dash-section="availability" className="mt-6">
              <h2 className="mb-2 font-display text-lg text-olive-900">Check with supplier</h2>
              <div className="rounded-xl border border-olive-100 bg-white">
                <ul className="divide-y divide-olive-50">
                  {availWatch.map((p) => (
                    <li key={p.slug} className="flex items-center gap-3 px-4 py-2">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${p.availability === "UNAVAILABLE" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{p.availability === "UNAVAILABLE" ? "Unavailable" : "Limited"}</span>
                      <Link href={`/admin/products/${p.slug}`} className="min-w-0 flex-1 truncate text-sm text-olive-800 hover:underline">{p.name}</Link>
                      <span className="shrink-0 text-xs text-olive-400">{p.supplier || "no supplier"}{p.leadTimeDays ? ` · ${p.leadTimeDays}d lead` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {/* Sales reps */}
          {reps.length ? (
            <section data-dash-section="reps" className="mt-6">
              <h2 className="mb-2 font-display text-lg text-olive-900">Sales reps · {win.label}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {reps.map((r) => (
                  <div key={r.name} className="rounded-xl border border-olive-100 bg-white p-4">
                    <p className="text-sm font-medium text-olive-900">{r.name}</p>
                    <p className="mt-1 text-lg font-semibold text-olive-900">{formatPrice(r.revenue)}</p>
                    <p className="text-xs text-olive-500">{r.count} invoice{r.count === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Activity */}
          <section data-dash-section="activity" className="mt-6">
            <h2 className="mb-2 font-display text-lg text-olive-900">Activity</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
          <section data-dash-section="catalog" className="mt-6">
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
