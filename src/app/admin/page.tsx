import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

async function stats() {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const [products, missingImage, hidden, custom, edits] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { imageUrl: null } }),
      prisma.product.count({ where: { isActive: false } }),
      prisma.product.count({ where: { isCustom: true } }),
      prisma.productOverride.count(),
    ]);
    return { products, missingImage, hidden, custom, edits };
  } catch {
    return null;
  }
}

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const s = await stats();

  if (!s) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-lg font-semibold">Database not connected</h1>
        <p className="mt-2 text-sm">
          The admin portal needs a database. Set <code>DATABASE_URL</code> in
          <code> .env</code>, then run <code>npm run db:migrate</code> and{" "}
          <code>npm run db:seed</code>.
        </p>
      </div>
    );
  }

  const cards = [
    { label: "Products", value: s.products, href: "/admin/products" },
    { label: "Missing an image", value: s.missingImage, href: "/admin/products?filter=missing-image", accent: s.missingImage > 0 },
    { label: "Hidden", value: s.hidden, href: "/admin/products?filter=hidden" },
    { label: "Custom (admin-made)", value: s.custom, href: "/admin/products?filter=custom" },
    { label: "Manual edits", value: s.edits, href: "/admin/products" },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl text-olive-900">Dashboard</h1>
      <p className="mt-1 text-sm text-olive-600">Welcome back, {user.name ?? user.email}.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-xl border bg-white p-5 transition-colors hover:border-olive-300 ${
              c.accent ? "border-amber-300" : "border-olive-100"
            }`}
          >
            <div className={`text-3xl font-semibold ${c.accent ? "text-amber-700" : "text-olive-900"}`}>
              {c.value}
            </div>
            <div className="mt-1 text-sm text-olive-600">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/products?filter=missing-image" className="rounded-lg bg-olive-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-olive-800">
          Fix missing images →
        </Link>
        <Link href="/admin/products/new" className="rounded-lg border border-olive-300 bg-white px-5 py-2.5 text-sm font-medium text-olive-900 hover:bg-olive-50">
          Add a product
        </Link>
      </div>
    </div>
  );
}
