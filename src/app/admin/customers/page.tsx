import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { composeAddress } from "@/lib/address";
import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type View = "all" | "retail" | "wholesale";

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminCustomers({
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
  const view: View = (["all", "retail", "wholesale"] as View[]).includes(firstValue(params.view) as View)
    ? (firstValue(params.view) as View)
    : "all";
  const q = (firstValue(params.q) || "").trim();

  const search: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { businessName: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const roleWhere: Prisma.CustomerWhereInput =
    view === "retail" ? { role: "CUSTOMER" } : view === "wholesale" ? { role: "WHOLESALE" } : {};

  const [customers, counts, pendingApps] = await Promise.all([
    prisma.customer.findMany({
      where: { AND: [roleWhere, search] },
      orderBy: [{ businessName: "asc" }, { name: "asc" }, { email: "asc" }],
      take: 500,
    }),
    prisma.customer.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.wholesaleApplication.count({ where: { status: { in: ["NEW", "IN_REVIEW"] } } }),
  ]);

  const countFor = (r: "CUSTOMER" | "WHOLESALE") =>
    counts.find((c) => c.role === r)?._count._all ?? 0;
  const total = countFor("CUSTOMER") + countFor("WHOLESALE");

  const SEGMENTS: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All", count: total },
    { key: "retail", label: "Retail", count: countFor("CUSTOMER") },
    { key: "wholesale", label: "Wholesale", count: countFor("WHOLESALE") },
  ];
  const segHref = (v: View) => {
    const p = new URLSearchParams();
    if (v !== "all") p.set("view", v);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/admin/customers${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-olive-900">Customers</h1>
        {pendingApps > 0 ? (
          <Link
            href="/admin/wholesale"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            {pendingApps} new applicant{pendingApps === 1 ? "" : "s"} →
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Retail ⇄ Wholesale toggle */}
        <div className="inline-flex rounded-lg border border-olive-200 bg-white p-0.5 text-sm">
          {SEGMENTS.map((s) => {
            const active = s.key === view;
            return (
              <Link
                key={s.key}
                href={segHref(s.key)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  active ? "bg-olive-900 text-white" : "text-olive-700 hover:bg-olive-50"
                }`}
              >
                {s.label}
                <span className={`ml-1.5 text-xs ${active ? "text-white/70" : "text-olive-400"}`}>{s.count}</span>
              </Link>
            );
          })}
        </div>

        {/* Search */}
        <form action="/admin/customers" className="flex gap-2">
          {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search business, name, email…"
            className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none sm:w-64"
          />
          <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white">Search</button>
        </form>
      </div>

      {customers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-olive-100 bg-white p-10 text-center text-olive-600">
          {q ? `No customers match “${q}”.` : "No customers yet."}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-5 hidden overflow-hidden rounded-xl border border-olive-100 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
                <tr>
                  <th className="p-3">Business / Name</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Role</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-olive-50 last:border-0 align-top hover:bg-olive-50/40">
                    <td className="p-3 font-medium">
                      <Link href={`/admin/customers/${c.id}`} className="text-olive-900 hover:underline">
                        {c.businessName || c.name || "—"}
                      </Link>
                    </td>
                    <td className="p-3 text-olive-700">{c.businessName && c.name ? c.name : c.businessName ? <MissingTag label="contact" /> : "—"}</td>
                    <td className="p-3 break-all text-olive-700">{c.email}</td>
                    <td className="p-3 whitespace-nowrap">{c.phone ? <span className="text-olive-700">{c.phone}</span> : <MissingTag label="phone" />}</td>
                    <td className="p-3">{shortLocation(c) ? <span className="text-olive-600">{shortLocation(c)}</span> : <MissingTag label="address" />}</td>
                    <td className="p-3"><RoleBadge role={c.role} blocked={c.blocked} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-5 grid gap-3 md:hidden">
            {customers.map((c) => (
              <Link
                key={c.id}
                href={`/admin/customers/${c.id}`}
                className="block rounded-xl border border-olive-100 bg-white p-4 hover:border-olive-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-olive-900">{c.businessName || c.name || "—"}</p>
                  <RoleBadge role={c.role} blocked={c.blocked} />
                </div>
                {c.businessName && c.name ? <p className="mt-0.5 text-sm text-olive-600">{c.name}</p> : null}
                <p className="mt-1 text-sm break-all text-olive-700">{c.email}</p>
                <p className="mt-1 text-sm">{c.phone ? <span className="text-olive-700">{c.phone}</span> : <MissingTag label="phone" />}</p>
                <p className="mt-1 text-sm">{composeAddress(c) ? <span className="text-olive-500">{composeAddress(c)}</span> : <MissingTag label="address" />}</p>
              </Link>
            ))}
          </div>

          <p className="mt-4 text-xs text-olive-500">
            {customers.length.toLocaleString()} shown{customers.length === 500 ? " (first 500)" : ""}.
          </p>
        </>
      )}
    </div>
  );
}

function MissingTag({ label }: { label: string }) {
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Missing {label}</span>;
}

function shortLocation(c: { city?: string | null; state?: string | null; address?: string | null }): string | null {
  if (c.city || c.state) return [c.city, c.state].filter(Boolean).join(", ");
  const address = composeAddress(c);
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    const city = parts[parts.length - 2];
    const st = parts[parts.length - 1].split(/\s+/)[0];
    return `${city}, ${st}`;
  }
  return address;
}

function RoleBadge({ role, blocked }: { role: string; blocked: boolean }) {
  if (blocked) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Blocked</span>;
  }
  const wholesale = role === "WHOLESALE";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        wholesale ? "bg-emerald-100 text-emerald-700" : "bg-olive-100 text-olive-700"
      }`}
    >
      {wholesale ? "Wholesale" : "Customer"}
    </span>
  );
}
