import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, PackageCheck, Store } from "lucide-react";

import { AccountHeader } from "@/components/account/account-header";
import { OrderStatusPill } from "@/components/account/order-status-pill";
import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { invoiceDisplay } from "@/lib/invoice";
import { formatPrice } from "@/lib/utils";

export const metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account");

  const isWholesale = customer.role === "WHOLESALE";
  const prisma = getPrisma();

  let application: { status: string; decisionNote: string | null } | null = null;
  let invoices: { id: string; number: string; issueDate: Date; dueDate: Date | null; status: string; totalCents: number; paidCents: number; publicToken: string | null }[] = [];
  let orders: { id: string; reference: string; status: string; createdAt: Date; _count: { lines: number } }[] = [];

  if (prisma) {
    try {
      const [apps, inv, ord] = await Promise.all([
        isWholesale ? Promise.resolve(null) : prisma.wholesaleApplication.findFirst({
          where: { customerId: customer.id },
          orderBy: { createdAt: "desc" },
          select: { status: true, decisionNote: true },
        }),
        prisma.customerInvoice.findMany({
          where: { customerId: customer.id, publicToken: { not: null } },
          orderBy: { issueDate: "desc" },
          select: { id: true, number: true, issueDate: true, dueDate: true, status: true, totalCents: true, paidCents: true, publicToken: true },
        }),
        prisma.orderRequest.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { lines: true } } },
        }),
      ]);
      application = apps;
      invoices = inv;
      orders = ord;
    } catch {
      /* DB unavailable — render the portal with empty sections */
    }
  }

  const pending = application?.status === "NEW" || application?.status === "IN_REVIEW";
  const declined = application?.status === "REJECTED";

  const now = new Date();
  const live = invoices.filter((i) => i.status !== "VOID");
  const openBalance = live.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const openCount = live.filter((i) => i.totalCents - i.paidCents > 0).length;
  const overdueCount = invoices.filter((i) => invoiceDisplay(i, now).key === "overdue").length;

  return (
    <Container className="py-12 lg:py-16">
      <AccountHeader name={customer.name} email={customer.email} isWholesale={isWholesale} />

      {isWholesale ? (
        <>
          {/* Stats */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Open balance" value={formatPrice(openBalance)} danger={openBalance > 0} />
            <Stat label="Open invoices" value={String(openCount)} />
            <Stat label="Overdue" value={String(overdueCount)} danger={overdueCount > 0} />
            <Stat label="Orders placed" value={String(orders.length)} />
          </div>

          {/* Primary CTA */}
          <Link
            href="/wholesale/order"
            className="group mt-5 flex items-center justify-between rounded-card border border-olive-100 bg-white p-6 transition-colors hover:border-olive-300"
          >
            <div className="flex items-center gap-4">
              <Store className="h-6 w-6 text-olive-600" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold text-olive-900">Place a wholesale order</h2>
                <p className="mt-0.5 text-sm text-olive-600">Browse your line sheet and build an order in cases.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-olive-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* Recent invoices */}
          <SectionHead title="Recent invoices" href="/account/invoices" show={invoices.length > 0} />
          {invoices.length === 0 ? (
            <Empty>No invoices yet. We&apos;ll email you when your first invoice is ready.</Empty>
          ) : (
            <div className="mt-3 overflow-hidden rounded-card border border-olive-100 bg-white">
              <table className="w-full text-sm">
                <tbody>
                  {invoices.slice(0, 3).map((i) => {
                    const disp = invoiceDisplay(i, now);
                    const balance = i.totalCents - i.paidCents;
                    return (
                      <tr key={i.id} className="border-b border-olive-50 last:border-0">
                        <td className="p-3 font-medium">
                          {i.publicToken ? <Link href={`/invoice/${i.publicToken}`} className="text-olive-900 hover:underline">{i.number}</Link> : i.number}
                        </td>
                        <td className="p-3 whitespace-nowrap text-olive-500">{dateFmt(i.issueDate)}</td>
                        <td className="p-3 text-right text-olive-800">{formatPrice(i.totalCents)}</td>
                        <td className="p-3 text-right text-olive-500">{balance > 0 ? `${formatPrice(balance)} due` : "—"}</td>
                        <td className="p-3 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${disp.badge}`}>{disp.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent orders */}
          <SectionHead title="Recent orders" href="/account/orders" show={orders.length > 0} />
          {orders.length === 0 ? (
            <Empty>No order requests yet.</Empty>
          ) : (
            <div className="mt-3 overflow-hidden rounded-card border border-olive-100 bg-white">
              <table className="w-full text-sm">
                <tbody>
                  {orders.slice(0, 3).map((o) => (
                    <tr key={o.id} className="border-b border-olive-50 last:border-0">
                      <td className="p-3 font-medium text-olive-900">{o.reference}</td>
                      <td className="p-3 text-olive-500">{o._count.lines} item{o._count.lines === 1 ? "" : "s"}</td>
                      <td className="p-3 whitespace-nowrap text-olive-500">{dateFmt(o.createdAt)}</td>
                      <td className="p-3 text-right"><OrderStatusPill status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {pending ? (
            <div className="rounded-card border border-amber-200 bg-amber-50/60 p-6">
              <Store className="h-6 w-6 text-amber-700" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold text-olive-900">
                Wholesale application: <span className="text-amber-800">pending review</span>
              </h2>
              <p className="mt-1 text-sm text-olive-600">
                Thanks for applying. We review new trade accounts within two business days and will
                email you — you&apos;ll see wholesale pricing and ordering here once you&apos;re approved.
              </p>
            </div>
          ) : (
            <Link href="/wholesale" className="group rounded-card border border-olive-100 bg-white p-6 transition-colors hover:border-olive-300">
              <Store className="h-6 w-6 text-olive-600" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold text-olive-900">{declined ? "Re-apply for wholesale" : "Apply for wholesale"}</h2>
              <p className="mt-1 text-sm text-olive-600">
                {declined
                  ? "Your previous application wasn't approved. If your situation has changed, you're welcome to apply again."
                  : "Stock La Vague in your store — apply for a trade account with case pricing."}
              </p>
            </Link>
          )}

          <Link href="/shop" className="group rounded-card border border-olive-100 bg-white p-6 transition-colors hover:border-olive-300">
            <PackageCheck className="h-6 w-6 text-olive-600" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-olive-900">Continue shopping</h2>
            <p className="mt-1 text-sm text-olive-600">Browse the full range of imports and add to your cart.</p>
          </Link>
        </div>
      )}
    </Container>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-card border border-olive-100 bg-white p-4">
      <p className="text-xs text-olive-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${danger ? "text-red-700" : "text-olive-900"}`}>{value}</p>
    </div>
  );
}

function SectionHead({ title, href, show }: { title: string; href: string; show: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between">
      <h2 className="font-display text-lg text-olive-900">{title}</h2>
      {show ? <Link href={href} className="text-sm text-olive-600 hover:text-olive-900">View all →</Link> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-card border border-dashed border-olive-200 bg-white p-8 text-center text-sm text-olive-500">{children}</div>;
}
