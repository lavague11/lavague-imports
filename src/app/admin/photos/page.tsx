import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { photoKindLabel, PHOTO_KIND_BADGE } from "@/lib/invoice-photo-constants";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = {
  title: "Photo library · Admin",
  robots: { index: false, follow: false },
};

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const TABS = [
  { key: "all", label: "All" },
  { key: "DELIVERY", label: "Delivery" },
  { key: "PAYMENT", label: "Payment" },
  { key: "OTHER", label: "Other" },
];

export default async function PhotoLibrary({
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
  const tab = firstValue(sp.kind) || "all";
  const where: Prisma.InvoicePhotoWhereInput =
    tab === "DELIVERY" || tab === "PAYMENT" || tab === "OTHER" ? { kind: tab } : {};

  const [photos, counts] = await Promise.all([
    prisma.invoicePhoto.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { invoice: { select: { id: true, number: true, customer: { select: { businessName: true, name: true, email: true } } } } },
    }),
    prisma.invoicePhoto.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);

  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const countFor = (k: string) => (k === "all" ? total : counts.find((c) => c.kind === k)?._count._all ?? 0);

  const tabHref = (k: string) => (k === "all" ? "/admin/photos" : `/admin/photos?kind=${k}`);

  return (
    <div>
      <h1 className="font-display text-2xl text-olive-900">Photo library</h1>
      <p className="mt-1 text-sm text-olive-500">Every photo uploaded to an invoice — proof of delivery, payments, and more.</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} className={`rounded-full border px-3 py-1.5 text-sm ${tab === t.key ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}>
            {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.key ? "text-white/70" : "text-olive-400"}`}>{countFor(t.key)}</span>
          </Link>
        ))}
      </div>

      {photos.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-olive-200 bg-white p-10 text-center text-olive-500">
          {total === 0 ? "No photos yet. Upload one from any invoice." : `No ${tab.toLowerCase()} photos.`}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((p) => {
            const biz = p.invoice.customer.businessName || p.invoice.customer.name || p.invoice.customer.email;
            return (
              <div key={p.id} className="overflow-hidden rounded-xl border border-olive-100 bg-white">
                <a href={p.url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.label ?? photoKindLabel(p.kind)} className="h-36 w-full object-cover" />
                </a>
                <div className="space-y-1 p-2.5">
                  <span className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${PHOTO_KIND_BADGE[p.kind] ?? "bg-olive-100 text-olive-700"}`} title={p.label ?? photoKindLabel(p.kind)}>
                    {p.kind === "OTHER" && p.label ? p.label : photoKindLabel(p.kind)}
                  </span>
                  <p className="truncate text-xs text-olive-600" title={biz}>{biz}</p>
                  <div className="flex items-center justify-between text-xs">
                    <Link href={`/admin/invoices/${p.invoice.id}`} className="font-medium text-olive-800 hover:underline">{p.invoice.number}</Link>
                    <span className="text-olive-400">{dateFmt(p.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
