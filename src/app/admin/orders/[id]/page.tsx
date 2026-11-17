import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Order request · Admin",
  robots: { index: false, follow: false },
};

const BADGE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  QUOTED: "bg-sky-100 text-sky-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  DECLINED: "bg-red-100 text-red-700",
  CANCELLED: "bg-olive-100 text-olive-600",
};

export default async function OrderRequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const { id } = await params;
  const order = await prisma.orderRequest.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { orderBy: { productName: "asc" } },
      invoices: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, totalCents: true } },
    },
  });
  if (!order) notFound();

  const totalCases = order.lines.reduce((s, l) => s + l.cases, 0);
  const c = order.customer;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-olive-900">{order.reference}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[order.status] ?? "bg-olive-100 text-olive-700"}`}>
          {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
        </span>
        <span className="text-sm text-olive-500">
          {order.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-olive-100 bg-white p-4 text-sm">
        <p className="font-medium text-olive-900">
          <Link href={`/admin/customers/${c.id}`} className="hover:underline">{c.businessName || c.name || c.email}</Link>
        </p>
        <p className="text-olive-600">{[c.name, c.email, c.phone].filter(Boolean).join(" · ")}</p>
        {c.address ? <p className="text-olive-500">{c.address}</p> : null}
      </div>

      {order.note ? (
        <p className="mt-3 rounded-lg bg-olive-50 px-3 py-2 text-sm text-olive-700">
          <span className="font-medium">Customer note:</span> {order.note}
        </p>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-xl border border-olive-100 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Unit</th>
              <th className="p-3">Case pack</th>
              <th className="p-3 text-right">Cases</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-b border-olive-50 last:border-0">
                <td className="p-3 font-medium text-olive-900">{l.productName}</td>
                <td className="p-3 text-olive-600">{l.unitSize ?? "—"}</td>
                <td className="p-3 text-olive-600">{l.casePack ? `${l.casePack}/case` : "—"}</td>
                <td className="p-3 text-right text-olive-800">{l.cases}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-olive-50/40">
              <td className="p-3 font-medium text-olive-700" colSpan={3}>{order.lines.length} items</td>
              <td className="p-3 text-right font-medium text-olive-900">{totalCases} cases</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.invoices.length > 0 ? (
        <div className="mt-4 rounded-xl border border-olive-100 bg-white p-4 text-sm">
          <p className="font-medium text-olive-800">Invoices from this request</p>
          <ul className="mt-2 space-y-1">
            {order.invoices.map((inv) => (
              <li key={inv.id}>
                <Link href={`/admin/invoices/${inv.id}`} className="text-olive-700 hover:underline">{inv.number}</Link>
                <span className="text-olive-400"> · {formatPrice(inv.totalCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form method="post" action={`/admin/orders/${order.id}/invoice`}>
          <button className="rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
            {order.invoices.length > 0 ? "Create another invoice" : "Create invoice"}
          </button>
        </form>
        <p className="text-sm text-olive-500">Prefills one line per item (quantity in cases) — add prices in the editor.</p>
      </div>
    </div>
  );
}
