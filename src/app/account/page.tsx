import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageCheck, Store } from "lucide-react";

import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";

export const metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account");

  const isWholesale = customer.role === "WHOLESALE";

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
        ) : (
          <Link
            href="/wholesale"
            className="group rounded-card border border-olive-100 bg-white p-6 transition-colors hover:border-olive-300"
          >
            <Store className="h-6 w-6 text-olive-600" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-olive-900">Apply for wholesale</h2>
            <p className="mt-1 text-sm text-olive-600">
              Stock La Vague in your store — apply for a trade account with case pricing.
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
