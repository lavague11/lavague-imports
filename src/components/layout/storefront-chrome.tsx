"use client";

import { usePathname } from "next/navigation";

/**
 * Renders the storefront chrome (header + footer) on every route EXCEPT `/admin/*`,
 * where the admin layout supplies its own single nav bar. This is what keeps the admin
 * area to one bar instead of stacking the store header on top of the admin nav.
 *
 * Header and Footer are passed in as already-rendered server components, so they stay
 * server-rendered; this wrapper only decides whether to show them.
 */
export function StorefrontChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname?.startsWith("/admin/");

  if (isAdmin) {
    // Admin layout owns its chrome and its own <main>.
    return <>{children}</>;
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-olive-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      {header}
      <main id="main" className="flex-1">
        {children}
      </main>
      {footer}
    </>
  );
}
