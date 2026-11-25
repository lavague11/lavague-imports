import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

// Photo review (#8): sourced product photos awaiting approval. Nothing here is
// live on a product until approved. HIGH-confidence items are the normal queue;
// MEDIUM/LOW are flagged for a closer look.

export const dynamic = "force-dynamic";

const CONF_BADGE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-red-100 text-red-700",
};

export default async function PhotoReviewPage({
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
  const done = sp.done === "1";

  const pending = await prisma.pendingProductPhoto.findMany({
    where: { status: "pending" },
    include: { product: { select: { slug: true, name: true, brand: true, variants: { orderBy: { position: "asc" }, take: 1, select: { sku: true } } } } },
    orderBy: [{ confidence: "asc" }, { createdAt: "asc" }],
  });

  // Order high → medium → low (confidence stored as text).
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  pending.sort((a, b) => (order[a.confidence] ?? 9) - (order[b.confidence] ?? 9));

  const counts = {
    high: pending.filter((p) => p.confidence === "high").length,
    medium: pending.filter((p) => p.confidence === "medium").length,
    low: pending.filter((p) => p.confidence === "low").length,
  };

  const [approvedCount, rejectedCount] = await Promise.all([
    prisma.pendingProductPhoto.count({ where: { status: "approved" } }),
    prisma.pendingProductPhoto.count({ where: { status: "rejected" } }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-olive-900">Photo review</h1>
          <p className="mt-1 text-sm text-olive-600">
            Sourced photos awaiting approval. Nothing goes live on a product until you approve it.
          </p>
        </div>
        {counts.high > 0 ? (
          <form action="/admin/photo-review/apply" method="post">
            <input type="hidden" name="action" value="approveAllHigh" />
            <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
              Approve all {counts.high} high-confidence
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{counts.high} high</span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{counts.medium} medium</span>
        <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">{counts.low} low</span>
        <span className="rounded-full bg-olive-100 px-3 py-1 text-olive-700">{approvedCount} approved</span>
        <span className="rounded-full bg-olive-50 px-3 py-1 text-olive-500">{rejectedCount} rejected</span>
      </div>

      {done ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Updated.</p>
      ) : null}

      {pending.length === 0 ? (
        <div className="mt-6 rounded-xl border border-olive-100 bg-white p-10 text-center text-olive-600">
          Nothing waiting for review.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pending.map((p) => (
            <div key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-olive-100 bg-white">
              <div className="flex h-48 items-center justify-center border-b border-olive-50 bg-olive-50/40 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.mediaUrl} alt={p.product.name} className="max-h-44 max-w-full object-contain" />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-olive-900">{p.product.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${CONF_BADGE[p.confidence] ?? "bg-olive-100 text-olive-600"}`}>
                    {p.confidence}
                  </span>
                </div>
                <p className="text-xs text-olive-500">
                  {p.product.brand ? `${p.product.brand} · ` : ""}
                  SKU {p.product.variants[0]?.sku ?? "—"}
                  {p.width ? ` · ${p.width}×${p.height ?? "?"}px` : ""}
                </p>
                <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-olive-600 underline underline-offset-2 hover:text-olive-900">
                  {new URL(p.sourceUrl).hostname.replace(/^www\./, "")} ↗
                </a>
                {p.note ? <p className="text-xs text-amber-700">{p.note}</p> : null}
                <div className="mt-auto flex gap-2 pt-1">
                  <form action="/admin/photo-review/apply" method="post" className="flex-1">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="action" value="approve" />
                    <button className="w-full rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">Approve</button>
                  </form>
                  <form action="/admin/photo-review/apply" method="post" className="flex-1">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="action" value="reject" />
                    <button className="w-full rounded-md border border-olive-300 px-3 py-1.5 text-sm font-medium text-olive-700 hover:bg-olive-50">Reject</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
