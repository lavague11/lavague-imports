import Link from "next/link";
import { redirect } from "next/navigation";

import { reviewApplication } from "@/app/admin/actions";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

type Tab = "pending" | "approved" | "declined" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

const STATUS_FILTER: Record<Tab, { status?: { in: ("NEW" | "IN_REVIEW" | "APPROVED" | "REJECTED")[] } }> = {
  pending: { status: { in: ["NEW", "IN_REVIEW"] } },
  approved: { status: { in: ["APPROVED"] } },
  declined: { status: { in: ["REJECTED"] } },
  all: {},
};

const BADGE: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-800",
  IN_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function AdminApplications({
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
  const tab: Tab = (["pending", "approved", "declined", "all"] as Tab[]).includes(params.tab as Tab)
    ? (params.tab as Tab)
    : "pending";

  const [apps, pendingCount] = await Promise.all([
    prisma.wholesaleApplication.findMany({
      where: STATUS_FILTER[tab],
      include: { customer: { select: { id: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.wholesaleApplication.count({ where: { status: { in: ["NEW", "IN_REVIEW"] } } }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-olive-900">Wholesale applications</h1>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/wholesale?tab=${t.key}`}
              className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
            >
              {t.label}
              {t.key === "pending" && pendingCount > 0 ? (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {apps.length === 0 ? (
        <div className="mt-6 rounded-xl border border-olive-100 bg-white p-10 text-center text-olive-600">
          No applications {tab === "all" ? "yet" : `in “${tab}”`}.
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {apps.map((a) => {
            const decided = a.status === "APPROVED" || a.status === "REJECTED";
            const address = [a.addressLine1, a.addressLine2, `${a.city}, ${a.state} ${a.postalCode}`]
              .filter(Boolean)
              .join(", ");
            return (
              <div key={a.id} className="rounded-xl border border-olive-100 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-olive-900">{a.businessName}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[a.status] ?? "bg-olive-100 text-olive-700"}`}>
                        {a.status === "REJECTED" ? "Declined" : a.status === "IN_REVIEW" ? "In review" : a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                      </span>
                      {a.customer ? (
                        <span className="rounded-full bg-olive-50 px-2 py-0.5 text-xs text-olive-600">
                          has account{a.customer.role === "WHOLESALE" ? " · wholesale" : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-olive-50 px-2 py-0.5 text-xs text-olive-500">no account</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-olive-600">
                      {a.businessType.charAt(0) + a.businessType.slice(1).toLowerCase()} · applied {fmtDate(a.createdAt)} · {a.reference}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-2"><dt className="text-olive-500">Contact</dt><dd className="text-olive-800">{a.contactName}</dd></div>
                  <div className="flex gap-2"><dt className="text-olive-500">Phone</dt><dd className="text-olive-800">{a.phone}</dd></div>
                  <div className="flex gap-2"><dt className="text-olive-500">Email</dt><dd className="text-olive-800 break-all">{a.email}</dd></div>
                  {a.taxId ? <div className="flex gap-2"><dt className="text-olive-500">Tax ID</dt><dd className="text-olive-800">{a.taxId}</dd></div> : null}
                  <div className="flex gap-2 sm:col-span-2"><dt className="text-olive-500">Address</dt><dd className="text-olive-800">{address}</dd></div>
                  {a.message ? <div className="flex gap-2 sm:col-span-2"><dt className="text-olive-500">Note</dt><dd className="text-olive-800">{a.message}</dd></div> : null}
                </dl>

                {decided ? (
                  <p className="mt-3 rounded-lg bg-olive-50 px-3 py-2 text-xs text-olive-600">
                    {a.status === "APPROVED" ? "Approved" : "Declined"} by {a.reviewedBy ?? "admin"}
                    {a.reviewedAt ? ` on ${fmtDate(a.reviewedAt)}` : ""}
                    {a.decisionNote ? ` — “${a.decisionNote}”` : ""}
                  </p>
                ) : (
                  <form action={reviewApplication} className="mt-4 border-t border-olive-50 pt-4">
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      name="note"
                      placeholder="Optional note to the applicant…"
                      className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        name="decision"
                        value="approve"
                        className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
                      >
                        Approve
                      </button>
                      <button
                        name="decision"
                        value="decline"
                        className="h-10 rounded-lg border border-olive-300 px-4 text-sm font-medium text-olive-700 hover:bg-olive-50"
                      >
                        Decline
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
