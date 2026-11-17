import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "New invoice · Admin",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewInvoice({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const sp = await searchParams;
  const preselect = firstValue(sp.customer) || "";
  const error = firstValue(sp.error);

  const customers = await prisma.customer.findMany({
    where: { blocked: false },
    orderBy: [{ role: "desc" }, { businessName: "asc" }, { name: "asc" }],
    select: { id: true, businessName: true, name: true, email: true, role: true },
    take: 1000,
  });

  const label = (c: (typeof customers)[number]) => {
    const base = c.businessName || c.name || c.email;
    const tag = c.role === "WHOLESALE" ? " · Wholesale" : "";
    return `${base}${tag}`;
  };

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All invoices
      </Link>
      <h1 className="mt-3 font-display text-2xl text-olive-900">New invoice</h1>
      <p className="mt-1 text-sm text-olive-500">Pick the customer this invoice is for. You&apos;ll add line items next.</p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "customer" ? "Choose a customer first." : "Couldn't create the invoice — try again."}
        </p>
      ) : null}

      <form method="post" action="/admin/invoices/create" className="mt-5 rounded-xl border border-olive-100 bg-white p-5">
        <label className="text-xs text-olive-500">Customer</label>
        <select
          name="customerId"
          defaultValue={preselect}
          required
          className="mt-1 h-11 w-full rounded-lg border border-olive-200 bg-white px-3 text-sm focus:border-olive-500 focus:outline-none"
        >
          <option value="" disabled>Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{label(c)}</option>
          ))}
        </select>
        <div className="mt-5 flex justify-end gap-3">
          <Link href="/admin/invoices" className="rounded-lg border border-olive-200 px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">Cancel</Link>
          <button type="submit" className="rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800">Create draft</button>
        </div>
      </form>

      <p className="mt-4 text-xs text-olive-500">
        Tip: you can also create an invoice straight from a wholesale order request on the Orders page.
      </p>
    </div>
  );
}
