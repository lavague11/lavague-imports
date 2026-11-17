import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { CustomerEditDrawer } from "@/components/admin/customer-edit-drawer";
import { InlineNotes } from "@/components/admin/inline-notes";
import { getCurrentUser } from "@/lib/auth";
import { composeAddress, mapsUrl } from "@/lib/address";
import { getPrisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Customer · Admin",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

type InvRow = { status: string; totalCents: number; paidCents: number; dueDate: Date | null };
function invoiceDisplay(i: InvRow, now: Date) {
  const balance = i.totalCents - i.paidCents;
  if (i.status === "VOID") return { key: "void", label: "Void", badge: "bg-olive-100 text-olive-500" };
  if (balance <= 0 && i.totalCents > 0) return { key: "paid", label: "Paid", badge: "bg-emerald-100 text-emerald-700" };
  if (i.dueDate && i.dueDate < now && balance > 0) return { key: "overdue", label: "Overdue", badge: "bg-red-100 text-red-700" };
  if (i.paidCents > 0) return { key: "partial", label: "Partial", badge: "bg-amber-100 text-amber-800" };
  return { key: "open", label: "Open", badge: "bg-sky-100 text-sky-800" };
}

function Missing({ label }: { label: string }) {
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Missing {label}</span>;
}

const INV_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
];

export default async function CustomerOverview({
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
  const invFilter = firstValue(sp.inv) || "all";

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      audits: { orderBy: { createdAt: "desc" }, take: 20 },
      invoices: { orderBy: { issueDate: "desc" } },
      orderRequests: { orderBy: { createdAt: "desc" }, take: 5, include: { _count: { select: { lines: true } } } },
    },
  });
  if (!customer) notFound();

  const now = new Date();
  const nonVoid = customer.invoices.filter((i) => i.status !== "VOID");
  const totalSpent = nonVoid.reduce((s, i) => s + i.paidCents, 0);
  const openBalance = nonVoid.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const invoiceCount = nonVoid.length;
  const aov = invoiceCount ? Math.round(nonVoid.reduce((s, i) => s + i.totalCents, 0) / invoiceCount) : 0;
  const lastInvoiceDate = customer.invoices[0]?.issueDate ?? null;
  const lastOrderDate = customer.orderRequests[0]?.createdAt ?? null;
  const lastOrder = [lastInvoiceDate, lastOrderDate].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

  const invoices = customer.invoices
    .map((i) => ({ ...i, disp: invoiceDisplay(i, now) }))
    .filter((i) => invFilter === "all" || i.disp.key === invFilter);

  const addr = composeAddress(customer);
  const maps = mapsUrl(customer);

  const stats = [
    { label: "Total spent", value: formatPrice(totalSpent) },
    { label: "Open balance", value: formatPrice(openBalance), danger: openBalance > 0 },
    { label: "Invoices", value: String(invoiceCount) },
    { label: "Avg. order", value: invoiceCount ? formatPrice(aov) : "—" },
    { label: "Last order", value: lastOrder ? dateFmt(lastOrder) : "—" },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All customers
      </Link>

      {/* Header */}
      <div className="mt-3 rounded-xl border border-olive-100 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl text-olive-900">
                {customer.businessName || customer.name || customer.email}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  customer.blocked ? "bg-red-100 text-red-700" : customer.role === "WHOLESALE" ? "bg-emerald-100 text-emerald-700" : "bg-olive-100 text-olive-700"
                }`}
              >
                {customer.blocked ? "Blocked" : customer.role === "WHOLESALE" ? "Wholesale" : "Customer"}
              </span>
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex flex-wrap items-center gap-2"><dt className="w-16 shrink-0 text-olive-500">Contact</dt><dd>{customer.name || <Missing label="contact name" />}</dd></div>
              <div className="flex flex-wrap items-center gap-2"><dt className="w-16 shrink-0 text-olive-500">Phone</dt><dd>{customer.phone ? <a href={`tel:${customer.phone}`} className="text-olive-800 hover:underline">{customer.phone}</a> : <Missing label="phone number" />}</dd></div>
              <div className="flex flex-wrap items-center gap-2"><dt className="w-16 shrink-0 text-olive-500">Email</dt><dd>{customer.email ? <a href={`mailto:${customer.email}`} className="break-all text-olive-800 hover:underline">{customer.email}</a> : <Missing label="email" />}</dd></div>
              <div className="flex flex-wrap items-center gap-2"><dt className="w-16 shrink-0 text-olive-500">Address</dt><dd>{addr && maps ? <a href={maps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-olive-800 hover:underline">{addr} <ExternalLink className="h-3 w-3 shrink-0 text-olive-400" /></a> : <Missing label="address" />}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-olive-400">
              Joined {dateFmt(customer.createdAt)}
              {customer.passwordHash ? "" : " · no password set"}
            </p>
          </div>
          <CustomerEditDrawer
            customer={{
              id: customer.id,
              email: customer.email,
              name: customer.name,
              businessName: customer.businessName,
              phone: customer.phone,
              notes: customer.notes,
              role: customer.role as "CUSTOMER" | "WHOLESALE",
              blocked: customer.blocked,
              street: customer.street,
              unit: customer.unit,
              city: customer.city,
              state: customer.state,
              zip: customer.zip,
              lat: customer.lat,
              lng: customer.lng,
              placeId: customer.placeId,
            }}
            audits={customer.audits.map((a) => ({ id: a.id, actor: a.actor, summary: a.summary, when: dateTimeFmt(a.createdAt) }))}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-olive-100 bg-white p-4">
            <p className="text-xs text-olive-500">{s.label}</p>
            <p className={`mt-1 text-lg font-semibold ${s.danger ? "text-red-700" : "text-olive-900"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Invoices */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-olive-900">Invoices</h2>
          <div className="flex flex-wrap gap-1.5">
            {INV_TABS.map((t) => (
              <Link
                key={t.key}
                href={`/admin/customers/${id}?inv=${t.key}`}
                className={`rounded-full border px-2.5 py-1 text-xs ${invFilter === t.key ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {customer.invoices.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-olive-200 bg-white p-8 text-center text-sm text-olive-500">
            No invoices yet.
          </div>
        ) : invoices.length === 0 ? (
          <div className="mt-3 rounded-xl border border-olive-100 bg-white p-8 text-center text-sm text-olive-500">
            No {invFilter} invoices.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-olive-100 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
                <tr>
                  <th className="p-3">Invoice</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3">Due</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const balance = i.totalCents - i.paidCents;
                  const overdue = i.disp.key === "overdue";
                  return (
                    <tr key={i.id} className={`border-b border-olive-50 last:border-0 hover:bg-olive-50/40 ${overdue ? "bg-red-50/40" : ""}`}>
                      <td className="p-3 font-medium"><Link href={`/admin/invoices/${i.id}`} className="text-olive-900 hover:underline">{i.number}</Link></td>
                      <td className="p-3 whitespace-nowrap text-olive-600">{dateFmt(i.issueDate)}</td>
                      <td className="p-3 text-right text-olive-800">{formatPrice(i.totalCents)}</td>
                      <td className={`p-3 text-right ${balance > 0 ? "font-medium text-olive-900" : "text-olive-400"}`}>{balance > 0 ? formatPrice(balance) : "—"}</td>
                      <td className={`p-3 whitespace-nowrap ${overdue ? "font-medium text-red-700" : "text-olive-600"}`}>{i.dueDate ? dateFmt(i.dueDate) : "—"}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${i.disp.badge}`}>{i.disp.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Order requests */}
      <section className="mt-6">
        <h2 className="font-display text-lg text-olive-900">Order requests</h2>
        {customer.orderRequests.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-olive-200 bg-white p-8 text-center text-sm text-olive-500">
            No order requests yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-olive-100 bg-white">
            <table className="w-full text-sm">
              <tbody>
                {customer.orderRequests.map((o) => (
                  <tr key={o.id} className="border-b border-olive-50 last:border-0 hover:bg-olive-50/40">
                    <td className="p-3 font-medium"><Link href={`/admin/orders/${o.id}`} className="text-olive-900 hover:underline">{o.reference}</Link></td>
                    <td className="p-3 text-olive-600">{o._count.lines} item{o._count.lines === 1 ? "" : "s"}</td>
                    <td className="p-3 whitespace-nowrap text-olive-500">{dateFmt(o.createdAt)}</td>
                    <td className="p-3 text-right"><span className="rounded-full bg-olive-100 px-2 py-0.5 text-xs font-medium text-olive-700">{o.status.charAt(0) + o.status.slice(1).toLowerCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Internal notes */}
      <section className="mt-6">
        <h2 className="font-display text-lg text-olive-900">Internal notes</h2>
        <p className="mt-0.5 mb-2 text-xs text-olive-500">Staff-only. Saved to the change history.</p>
        <InlineNotes id={customer.id} notes={customer.notes} />
      </section>
    </div>
  );
}
