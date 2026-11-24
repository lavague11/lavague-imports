import { redirect } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { AccountHeader } from "@/components/account/account-header";
import { OrderStatusPill } from "@/components/account/order-status-pill";
import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
};

const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AccountOrders() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account/orders");
  if (customer.role !== "WHOLESALE") redirect("/account");

  const prisma = getPrisma();
  const orders = prisma
    ? await prisma.orderRequest.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        include: { lines: { orderBy: { productName: "asc" } } },
      })
    : [];

  return (
    <Container className="py-12 lg:py-16">
      <AccountHeader name={customer.name} email={customer.email} isWholesale />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-olive-900">Order history</h2>
        {orders.length > 0 ? (
          <form method="post" action="/wholesale/order/reorder">
            <button className="inline-flex items-center gap-1.5 rounded-full border border-olive-200 px-4 py-2 text-sm font-medium text-olive-700 hover:bg-olive-50">
              <RotateCcw className="h-4 w-4" /> Reorder usual items
            </button>
          </form>
        ) : null}
      </div>

      {orders.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-olive-200 bg-white p-10 text-center text-olive-500">
          You haven&apos;t placed any orders yet.{" "}
          <a href="/wholesale/order" className="font-medium text-olive-800 underline">Start an order →</a>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {orders.map((o) => {
            const totalCases = o.lines.reduce((s, l) => s + l.cases, 0);
            return (
              <div key={o.id} className="overflow-hidden rounded-card border border-olive-100 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-olive-50 bg-olive-50/40 p-4">
                  <div className="flex items-center gap-3">
                    <a href={`/account/orders/${o.id}`} className="font-medium text-olive-900 hover:underline">{o.reference}</a>
                    <OrderStatusPill status={o.status} />
                    <span className="text-sm text-olive-500">{dateFmt(o.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {o.status === "QUOTED" ? (
                      <a href={`/account/orders/${o.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-olive-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-olive-800">
                        Review quote →
                      </a>
                    ) : (
                      <a href={`/account/orders/${o.id}`} className="inline-flex items-center rounded-full border border-olive-200 px-3 py-1.5 text-xs font-medium text-olive-700 hover:bg-olive-50">
                        View
                      </a>
                    )}
                    <form method="post" action={`/account/orders/${o.id}/reorder`}>
                      <button className="inline-flex items-center gap-1.5 rounded-full border border-olive-200 px-3 py-1.5 text-xs font-medium text-olive-700 hover:bg-olive-50">
                        <RotateCcw className="h-3.5 w-3.5" /> Reorder these
                      </button>
                    </form>
                  </div>
                </div>
                <ul className="divide-y divide-olive-50">
                  {o.lines.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="text-olive-800">{l.productName}{l.unitSize ? <span className="text-olive-400"> · {l.unitSize}</span> : null}</span>
                      <span className="whitespace-nowrap text-olive-600">{l.cases} case{l.cases === 1 ? "" : "s"}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-olive-50 px-4 py-2 text-right text-xs text-olive-500">{o.lines.length} items · {totalCases} cases</div>
                {o.adminNote ? <p className="border-t border-olive-50 bg-olive-50/40 px-4 py-2 text-xs text-olive-600"><span className="font-medium">Note from us:</span> {o.adminNote}</p> : null}
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
