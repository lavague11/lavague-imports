"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Core destinations shown in the admin bar. The wholesale system's Orders /
 *  Wholesale / Customers land here as they come online. */
const CORE = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/wholesale", label: "Wholesale" },
  { href: "/admin/customers", label: "Customers" },
];

/** Lower-frequency tools tucked under "More". */
const MORE = [
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/price-compare", label: "Price compare" },
  { href: "/admin/notifications", label: "Stock requests" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Settings" },
];

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

export function AdminNav({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const moreRef = useDismiss(() => setMoreOpen(false));
  const profileRef = useDismiss(() => setProfileOpen(false));

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const linkCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-olive-100 font-medium text-olive-900" : "text-olive-700 hover:bg-olive-50 hover:text-olive-900"
    }`;

  const moreActive = MORE.some((m) => isActive(m.href));

  return (
    <header className="border-b border-olive-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/admin" className="font-display text-lg whitespace-nowrap text-olive-900">
          La Vague <span className="text-olive-600">Admin</span>
        </Link>

        <nav className="ml-4 flex items-center gap-0.5">
          {CORE.map((n) => (
            <Link key={n.href} href={n.href} className={linkCls(isActive(n.href, n.exact))}>
              {n.label}
            </Link>
          ))}

          {/* More ▾ */}
          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className={`inline-flex items-center gap-1 ${linkCls(moreActive)}`}
              aria-expanded={moreOpen}
            >
              More <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {moreOpen ? (
              <div className="absolute left-0 z-50 mt-1 w-48 rounded-lg border border-olive-100 bg-white py-1 shadow-lg">
                {MORE.map((m) => (
                  <Link
                    key={m.href}
                    href={m.href}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-3 py-2 text-sm ${
                      isActive(m.href) ? "bg-olive-50 font-medium text-olive-900" : "text-olive-700 hover:bg-olive-50"
                    }`}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        {/* Profile menu (far right) */}
        <div ref={profileRef} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-olive-200 px-3 py-1.5 text-sm text-olive-700 hover:bg-olive-50"
            aria-expanded={profileOpen}
          >
            <span className="truncate">{email}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
          {profileOpen ? (
            <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-olive-100 bg-white py-1 shadow-lg">
              <p className="px-3 pt-1 pb-2 text-xs text-olive-500">
                Signed in{isAdmin ? " · Admin" : ""}
              </p>
              <Link href="/admin/account" onClick={() => setProfileOpen(false)} className="block px-3 py-2 text-sm text-olive-700 hover:bg-olive-50">
                Account
              </Link>
              <a href="/" target="_blank" rel="noreferrer" className="block px-3 py-2 text-sm text-olive-700 hover:bg-olive-50">
                View store ↗
              </a>
              <form action="/admin/logout" method="post" className="border-t border-olive-100">
                <button className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
