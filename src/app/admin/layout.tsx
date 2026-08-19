import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/app/admin/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin · La Vague Imports",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Signed out (e.g. the login page): render bare, no chrome.
  if (!user) {
    return (
      <div className="min-h-screen bg-olive-50 text-olive-900">{children}</div>
    );
  }

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/products/new", label: "New product" },
    ...(user.role === "ADMIN" ? [{ href: "/admin/users", label: "Users" }] : []),
    { href: "/admin/account", label: "Account" },
  ];

  return (
    <div className="min-h-screen bg-olive-50 text-olive-900">
      <header className="border-b border-olive-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/admin" className="font-display text-lg text-olive-900">
            La Vague <span className="text-olive-600">Admin</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-olive-700 hover:bg-olive-50 hover:text-olive-900"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/" className="text-olive-600 hover:underline" target="_blank">
              View store ↗
            </Link>
            <span className="text-olive-400">·</span>
            <span className="text-olive-600">{user.email}</span>
            <form action={logout}>
              <button className="rounded-md border border-olive-200 px-3 py-1 text-olive-700 hover:bg-olive-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
