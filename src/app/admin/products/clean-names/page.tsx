import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { suggestCleanName } from "@/lib/clean-name";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Suggest clean names · Admin",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const CAP = 200;

export default async function CleanNames({
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
  const renamed = firstValue(sp.renamed);

  const rows = await prisma.product.findMany({
    select: { slug: true, name: true, brand: true, variants: { orderBy: { position: "asc" }, take: 1, select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const diffs: { slug: string; name: string; brand: string | null; suggested: string }[] = [];
  for (const p of rows) {
    const vName = p.variants[0]?.name;
    const size = vName && vName.toLowerCase() !== "each" ? vName : "";
    const suggested = suggestCleanName(p.name, p.brand, size);
    if (suggested && suggested !== p.name) diffs.push({ slug: p.slug, name: p.name, brand: p.brand, suggested });
  }
  const shown = diffs.slice(0, CAP);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" /> All products
      </Link>
      <h1 className="mt-2 font-display text-2xl text-olive-900">Suggest clean names</h1>
      <p className="mt-1 text-sm text-olive-600">
        Proposed <span className="font-medium">Brand · Product · Size</span> names. Nothing changes until you approve — untick any you want to keep.
      </p>

      {renamed ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Renamed {renamed} product{renamed === "1" ? "" : "s"}.</p>
      ) : null}

      {diffs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-olive-200 bg-white p-10 text-center text-olive-500">
          Every product already follows the naming rule. Nothing to clean up.
        </div>
      ) : (
        <form method="post" action="/admin/products/clean-names/apply" className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-olive-600">
              {diffs.length} product{diffs.length === 1 ? "" : "s"} differ{diffs.length === 1 ? "s" : ""} from the rule
              {diffs.length > CAP ? ` · showing the first ${CAP}` : ""}
            </p>
            <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800">Approve selected</button>
          </div>
          <div className="divide-y divide-olive-50 overflow-hidden rounded-xl border border-olive-100 bg-white">
            {shown.map((d) => (
              <label key={d.slug} className="flex items-start gap-3 p-3 hover:bg-olive-50/40">
                <input type="checkbox" name="slug" value={d.slug} defaultChecked className="mt-1 h-4 w-4 shrink-0 accent-olive-800" />
                <input type="hidden" name={`new__${d.slug}`} value={d.suggested} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-olive-400 line-through">{d.name}</span>
                  <span className="block text-sm font-medium text-olive-900">{d.suggested}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <button className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800">Approve selected</button>
          </div>
        </form>
      )}
    </div>
  );
}
