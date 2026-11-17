import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheckBig } from "lucide-react";

import { Container } from "@/components/ui/container";
import { getCustomer } from "@/lib/customer-auth";

export const metadata = {
  title: "Order request received",
  robots: { index: false, follow: false },
};

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customer = await getCustomer();
  if (!customer) redirect("/login");
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref : null;

  return (
    <Container className="max-w-xl py-16 text-center lg:py-24">
      <CircleCheckBig className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
      <h1 className="mt-4 font-display text-3xl text-olive-900">Request received</h1>
      <p className="mx-auto mt-3 max-w-md text-olive-600">
        Thanks — we&apos;ve got your order request{ref ? <> (<span className="font-medium text-olive-800">{ref}</span>)</> : null}.
        We&apos;ll confirm pricing and send an invoice to {customer.email}. Nothing is charged yet.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/wholesale/order" className="rounded-lg bg-olive-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-olive-800">
          Start another order
        </Link>
        <Link href="/account" className="rounded-lg border border-olive-300 px-5 py-2.5 text-sm font-medium text-olive-800 hover:bg-olive-50">
          Back to your account
        </Link>
      </div>
    </Container>
  );
}
