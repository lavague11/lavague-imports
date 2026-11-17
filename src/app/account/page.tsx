import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageCheck, Store } from "lucide-react";

import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account");

  const isWholesale = customer.role === "WHOLESALE";

  // Latest wholesale application for this customer (for status on the card).
  const prisma = getPrisma();
  let application: { status: string; decisionNote: string | null } | null = null;
  if (prisma && !isWholesale) {
    try {
      application = await prisma.wholesaleApplication.findFirst({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        select: { status: true, decisionNote: true },
      });
    } catch {
      /* ignore */
    }
  }
  const pending = application?.status === "NEW" || application?.status === "IN_REVIEW";
  const declined = application?.status === "REJECTED";

  return (
    <Container className="py-12 lg:py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="mt-2 font-display text-3xl text-olive-900">
            {customer.name ? `Hello, ${customer.name.split(" ")[0]}` : "Hello"}
          </h1>
          <p className="mt-1 text-sm text-olive-600">{customer.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (isWholesale
                ? "bg-emerald-50 text-emerald-700"
                : "bg-olive-100 text-olive-700")
            }
          >
            {isWholesale ? "Wholesale account" : "Retail customer"}
          </span>
          <form action="/logout" method="post">
            <button className="rounded-full border border-olive-200 px-3 py-1 text-xs font-medium text-olive-700 hover:bg-olive-50">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {isWholesale ? (
          <Link
            href="/wholesale/order"
            className="group rounded-card border border-olive-100 bg-white p-6 transition-colors hover:border-olive-300"
          >
            <Store className="h-6 w-6 text-olive-600" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-olive-900">Place a wholesale order</h2>
            <p className="mt-1 text-sm text-olive-600">
              Browse your line sheet and build an order from your case pricing.
            </p>
          </Link>
        ) : pending ? (
          <div className="rounded-card border border-amber-200 bg-amber-50/60 p-6">
            <Store className="h-6 w-6 text-amber-700" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-olive-900">
              Wholesale application: <span className="text-amber-800">pending review</span>
            </h2>
            <p className="mt-1 text-sm text-olive-600">
              Thanks for applying. We review new trade accounts within two business days and
              will email you — you&apos;ll see wholesale pricing here once you&apos;re approved.
            </p>
          </div>
        ) : (
          <Link
            href="/wholesale"
            className="group rounded-card border border-olive-100 bg-white p-6 transition-colors hover:border-olive-300"
          >
            <Store className="h-6 w-6 text-olive-600" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-olive-900">
              {declined ? "Re-apply for wholesale" : "Apply for wholesale"}
            </h2>
            <p className="mt-1 text-sm text-olive-600">
              {declined
                ? "Your previous application wasn't approved. If your situation has changed, you're welcome to apply again."
                : "Stock La Vague in your store — apply for a trade account with case pricing."}
            </p>
          </Link>
        )}

        <Link
          href="/shop"
          className="group rounded-card border border-olive-100 bg-white p-6 transition-colors hover:border-olive-300"
        >
          <PackageCheck className="h-6 w-6 text-olive-600" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-olive-900">Continue shopping</h2>
          <p className="mt-1 text-sm text-olive-600">
            Browse the full range of imports and add to your cart.
          </p>
        </Link>
      </div>
    </Container>
  );
}
