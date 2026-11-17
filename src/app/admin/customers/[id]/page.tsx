import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CustomerEditForm } from "@/components/admin/customer-edit-form";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Customer · Admin",
  robots: { index: false, follow: false },
};

function fmtDateTime(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function CustomerDetail({
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
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      audits: { orderBy: { createdAt: "desc" }, take: 20 },
      applications: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All customers
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-olive-900">
          {customer.businessName || customer.name || customer.email}
        </h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            customer.blocked
              ? "bg-red-100 text-red-700"
              : customer.role === "WHOLESALE"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-olive-100 text-olive-700"
          }`}
        >
          {customer.blocked ? "Blocked" : customer.role === "WHOLESALE" ? "Wholesale" : "Customer"}
        </span>
      </div>
      <p className="mt-1 text-sm text-olive-500">
        Joined {customer.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        {customer.passwordHash ? "" : " · no password set (can claim via “Forgot password”)"}
      </p>

      <div className="mt-6">
        <CustomerEditForm
          customer={{
            id: customer.id,
            email: customer.email,
            name: customer.name,
            businessName: customer.businessName,
            phone: customer.phone,
            address: customer.address,
            notes: customer.notes,
            role: customer.role as "CUSTOMER" | "WHOLESALE",
            blocked: customer.blocked,
          }}
        />
      </div>

      {customer.applications.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-olive-900">Wholesale applications</h2>
          <ul className="mt-2 space-y-1 text-sm text-olive-700">
            {customer.applications.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2">
                <span className="text-olive-500">{a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span>{a.businessName}</span>
                <span className="text-olive-400">·</span>
                <span className="font-medium">{a.status === "REJECTED" ? "Declined" : a.status.charAt(0) + a.status.slice(1).toLowerCase()}</span>
                <Link href="/admin/wholesale" className="text-olive-600 underline underline-offset-2">view</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-olive-900">Change history</h2>
        {customer.audits.length === 0 ? (
          <p className="mt-2 text-sm text-olive-500">No changes recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {customer.audits.map((a) => (
              <li key={a.id} className="rounded-lg border border-olive-100 bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-olive-500">
                  <span>{a.actor}</span>
                  <span>{fmtDateTime(a.createdAt)}</span>
                </div>
                <p className="mt-1 text-olive-700">{a.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
