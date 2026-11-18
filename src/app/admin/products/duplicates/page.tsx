import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DuplicateCleanup } from "@/components/admin/duplicate-cleanup";
import { getCurrentUser } from "@/lib/auth";
import { findDuplicateGroups } from "@/lib/admin/duplicates";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Possible duplicates · Admin",
  robots: { index: false, follow: false },
};

const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function DuplicatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  if (!prisma) return <p className="text-olive-700">Database not connected.</p>;

  const { groups, total } = await findDuplicateGroups(100);
  const mergeRows = await prisma.mergeLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  const recent = mergeRows.map((m) => {
    const snap = m.snapshot as { losers?: unknown[] } | null;
    return { id: m.id, survivorSlug: m.survivorSlug, count: Array.isArray(snap?.losers) ? snap!.losers!.length : 0, when: when(m.createdAt), undone: !!m.undoneAt };
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" /> All products
      </Link>
      <h1 className="mt-2 font-display text-2xl text-olive-900">Possible duplicates</h1>
      <p className="mt-1 mb-6 text-sm text-olive-600">
        Products that look like the same item (same brand + name). Merge them into one, make the others sizes of one product, or mark a group as not duplicates. Merges are logged and can be undone.
      </p>
      <DuplicateCleanup groups={groups} total={total} recent={recent} />
    </div>
  );
}
