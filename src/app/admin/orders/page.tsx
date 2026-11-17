import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Tab = "open" | "submitted" | "quoted" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "submitted", label: "New" },
  { key: "quoted", label: "Quoted" },
  { key: "all", label: "All" },
];

const WHERE: Record<Tab, Prisma.OrderRequestWhereInput> = {
  open: { status: { in: ["SUBMITTED", "QUOTED", "APPROVED"] } },
  submitted: { status: { in: ["SUBMITTED"] } },
  quoted: { status: { in: ["QUOTED"] } },
  all: {},
};

const BADGE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  QUOTED: "bg-sky-100 text-sky-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  DECLINED: "bg-red-100 text-red-700",
  CANCELLED: "bg-olive-100 text-olive-600",
};

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const params = await searchParams;
  const tab: Tab = (["open", "submitted", "quoted", "all"] as Tab[]).includes(firstValue(params.tab) as Tab)
    ? (firstValue(params.tab) as Tab)
    : "open";

  const [orders, newCount] = await Promise.all([
    prisma.orderRequest.findMany({
      where: WHERE[tab],
      include: {
        customer: { select: { businessName: true, name: true, email: true } },
        _count: { select: { lines: true } },
        lines: { select: { cases: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.orderRequest.count({ where: { status: "SUBMITTED" } }),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-olive-900">Orders</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/orders?tab=${t.key}`}
              className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
            >
              {t.label}
              {t.key === "submitted" && newCount > 0 ? (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{newCount}</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-olive-100 bg-white p-10 text-center text-olive-600">
          No order requests {tab === "all" ? "yet" : `in “${tab}”`}.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-olive-100 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
              <tr>
                <th className="p-3">Request</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Items</th>
                <th className="p-3">Cases</th>
                <th className="p-3">Date</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cases = o.lines.reduce((s, l) => s + l.cases, 0);
                return (
                  <tr key={o.id} className="border-b border-olive-50 last:border-0 hover:bg-olive-50/40">
                    <td className="p-3 font-medium">
                      <Link href={`/admin/orders/${o.id}`} className="text-olive-900 hover:underline">{o.reference}</Link>
                    </td>
                    <td className="p-3 text-olive-700">{o.customer.businessName || o.customer.name || o.customer.email}</td>
                    <td className="p-3 text-olive-600">{o._count.lines}</td>
                    <td className="p-3 text-olive-600">{cases}</td>
                    <td className="p-3 whitespace-nowrap text-olive-600">{fmt(o.createdAt)}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[o.status] ?? "bg-olive-100 text-olive-700"}`}>
                        {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
