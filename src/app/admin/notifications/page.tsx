import Link from "next/link";
import { redirect } from "next/navigation";

import { markNotified } from "@/app/admin/actions";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";

export default async function AdminNotifications({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected — see the dashboard.</p>;

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sent = Number(first(sp.sent));
  const failed = Number(first(sp.failed));
  const errorCode = first(sp.error);
  const emailReady = mailConfigured();

  const [pending, doneCount] = await Promise.all([
    prisma.stockNotification.findMany({
      where: { notified: false },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.stockNotification.count({ where: { notified: true } }),
  ]);

  // Group pending requests by product so demand is easy to read.
  const byProduct = new Map<string, { name: string; rows: typeof pending }>();
  for (const r of pending) {
    const g = byProduct.get(r.productSlug) ?? { name: r.productName, rows: [] };
    g.rows.push(r);
    byProduct.set(r.productSlug, g);
  }
  const groups = [...byProduct.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length);

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl text-olive-900">Back-in-stock requests</h1>
      <p className="mt-1 mb-4 text-sm text-olive-600">
        Customers waiting for an out-of-stock item. {pending.length} pending · {doneCount} handled.
      </p>

      {sent > 0 ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Sent {sent} email{sent === 1 ? "" : "s"}.{failed ? ` ${failed} failed to send.` : ""}
        </p>
      ) : null}
      {errorCode === "not-configured" ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Email isn&apos;t configured yet — set the mail environment variables to enable sending.
        </p>
      ) : null}
      {!emailReady ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sending isn&apos;t configured. Add <code>RESEND_API_KEY</code> (or <code>SMTP_HOST</code> /
          <code>SMTP_USER</code> / <code>SMTP_PASS</code>) and <code>MAIL_FROM</code> to enable the
          &ldquo;Email the waitlist&rdquo; button. Until then you can still email people manually.
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-olive-100 bg-white p-6 text-sm text-olive-600">
          No pending requests right now.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(([slug, group]) => (
            <div key={slug} className="overflow-hidden rounded-xl border border-olive-100 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-olive-100 bg-olive-50/60 px-4 py-2.5">
                <Link href={`/shop/${slug}`} target="_blank" className="min-w-0 truncate text-sm font-medium text-olive-900 hover:underline">
                  {group.name}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-olive-900 px-2.5 py-0.5 text-xs font-medium text-white">
                    {group.rows.length} waiting
                  </span>
                  <form action="/admin/notifications/email" method="post">
                    <input type="hidden" name="productSlug" value={slug} />
                    <button
                      disabled={!emailReady}
                      title={emailReady ? "Email everyone waiting that it's back" : "Configure email sending first"}
                      className="rounded-md bg-olive-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-olive-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Email the waitlist
                    </button>
                  </form>
                </div>
              </div>
              <ul className="divide-y divide-olive-50">
                {group.rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <a href={`mailto:${r.email}`} className="font-medium text-olive-800 hover:underline">
                      {r.email}
                    </a>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-olive-400">{fmt(r.createdAt)}</span>
                      <form action={markNotified}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="rounded-md border border-olive-300 px-2.5 py-1 text-xs text-olive-700 hover:bg-olive-50">
                          Mark done
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
