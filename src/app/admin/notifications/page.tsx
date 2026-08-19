import Link from "next/link";
import { redirect } from "next/navigation";

import { markNotified } from "@/app/admin/actions";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export default async function AdminNotifications() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected — see the dashboard.</p>;

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
      <p className="mt-1 mb-6 text-sm text-olive-600">
        Customers waiting for an out-of-stock item. {pending.length} pending · {doneCount} handled.
      </p>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-olive-100 bg-white p-6 text-sm text-olive-600">
          No pending requests right now.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(([slug, group]) => (
            <div key={slug} className="overflow-hidden rounded-xl border border-olive-100 bg-white">
              <div className="flex items-center justify-between border-b border-olive-100 bg-olive-50/60 px-4 py-2.5">
                <Link href={`/shop/${slug}`} target="_blank" className="text-sm font-medium text-olive-900 hover:underline">
                  {group.name}
                </Link>
                <span className="rounded-full bg-olive-900 px-2.5 py-0.5 text-xs font-medium text-white">
                  {group.rows.length} waiting
                </span>
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
