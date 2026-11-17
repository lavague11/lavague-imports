"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sub-navigation across the customer portal pages. */
export function AccountTabs({ isWholesale }: { isWholesale: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/account", label: "Overview", exact: true },
    { href: "/account/invoices", label: "Invoices" },
    ...(isWholesale ? [{ href: "/account/orders", label: "Orders" }] : []),
    { href: "/account/profile", label: "Profile" },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-olive-100">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active(t.href, t.exact)
              ? "border-olive-900 text-olive-900"
              : "border-transparent text-olive-600 hover:text-olive-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
