import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { products as seedProducts } from "@/lib/catalog/data";
import { getPrisma } from "@/lib/db";
import { getGoogleUser } from "@/lib/google-session";

interface Stats {
  source: "db" | "fallback";
  products: number;
  missingImage: number;
  hidden: number;
  custom: number;
  edits: number;
}

async function stats(): Promise<Stats> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const [products, missingImage, hidden, custom, edits] = await Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { imageUrl: null } }),
        prisma.product.count({ where: { isActive: false } }),
        prisma.product.count({ where: { isCustom: true } }),
        prisma.productOverride.count(),
      ]);
      return { source: "db", products, missingImage, hidden, custom, edits };
    } catch {
      /* DB unreachable — fall back to the generated seed catalog */
    }
  }
  return {
    source: "fallback",
    products: seedProducts.length,
    missingImage: seedProducts.filter((p) => !p.imageUrl).length,
    hidden: seedProducts.filter((p) => p.hidden).length,
    custom: 0,
    edits: 0,
  };
}

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!user) {
    // A signed-in Google account that isn't on the admin list gets a reason.
    const google = await getGoogleUser();
    redirect(google ? "/admin/login?error=not-allowed" : "/admin/login");
  }

  const s = await stats();
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

      {s.source === "fallback" ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Database offline</strong> — showing the built-in catalog. Browsing works, but
          editing products, custom items, and manual edits need <code>DATABASE_URL</code> connected.
        </div>
      ) : null}

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
