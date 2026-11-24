"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { QuoteCartButton } from "@/components/cart/quote-cart-button";
import { Container } from "@/components/ui/container";
import { navigation, site } from "@/lib/site";
import { cn } from "@/lib/utils";

type Account = { loggedIn: boolean; name?: string | null; role?: string | null };

export function Header() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // The store is statically rendered, so learn the signed-in state client-side
  // from /api/me (keeps every page cacheable). Defaults to logged-out.
  const [account, setAccount] = useState<Account>({ loggedIn: false });

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data) setAccount(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const firstName = account.name ? account.name.split(" ")[0] : "Account";
  // The catalog download is for approved wholesale accounts only.
  const isWholesale = account.role === "WHOLESALE";

  return (
    <header className="sticky top-0 z-40 border-b border-olive-100 bg-white/95 backdrop-blur">
      <div className="bg-olive-900 text-white">
        <Container className="flex h-9 items-center justify-between text-xs">
          <p className="tracking-wide">
            Free shipping on every online order · NY &amp; NJ delivery
          </p>
          <a
            href={site.phoneHref}
            className="hidden font-medium hover:underline sm:block"
          >
            {site.phone}
          </a>
        </Container>
      </div>

      <Container>
        <div className="flex h-18 items-center justify-between gap-4">
          <Link href="/" aria-label={`${site.name} home`}>
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {navigation.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-olive-50 text-olive-900"
                      : "text-olive-700 hover:bg-olive-50 hover:text-olive-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {account.loggedIn ? (
              <>
                {isWholesale ? (
                  <Link
                    href="/catalog"
                    className="hidden rounded-full px-3 py-2 text-sm font-medium text-olive-700 transition-colors hover:bg-olive-50 hover:text-olive-900 sm:inline-flex"
                  >
                    Catalog
                  </Link>
                ) : null}
                <Link
                  href="/account"
                  className="hidden max-w-[140px] items-center truncate rounded-full border border-olive-200 px-3 py-2 text-sm font-medium text-olive-800 transition-colors hover:bg-olive-50 sm:inline-flex"
                >
                  {firstName}
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                className="hidden rounded-full px-3 py-2 text-sm font-medium text-olive-700 transition-colors hover:bg-olive-50 hover:text-olive-900 sm:inline-flex"
              >
                Sign in
              </Link>
            )}
            <QuoteCartButton />
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-nav"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-olive-800 hover:bg-olive-50 lg:hidden"
            >
              {isMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
              <span className="sr-only">
                {isMenuOpen ? "Close menu" : "Open menu"}
              </span>
            </button>
          </div>
        </div>
      </Container>

      {isMenuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-olive-100 bg-white lg:hidden"
        >
          <Container className="flex flex-col py-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg px-2 py-3 text-sm font-medium text-olive-800 hover:bg-olive-50"
              >
                {item.label}
              </Link>
            ))}
            {account.loggedIn ? (
              <>
                {isWholesale ? (
                  <Link
                    href="/catalog"
                    onClick={() => setIsMenuOpen(false)}
                    className="mt-1 border-t border-olive-100 px-2 pt-3 pb-3 text-sm font-medium text-olive-700 hover:bg-olive-50"
                  >
                    Catalog
                  </Link>
                ) : null}
                <Link
                  href="/account"
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-lg px-2 py-3 text-sm font-medium text-olive-800 hover:bg-olive-50"
                >
                  {firstName} · Account
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsMenuOpen(false)}
                className="mt-1 border-t border-olive-100 px-2 pt-3 pb-3 text-sm font-medium text-olive-700 hover:bg-olive-50"
              >
                Sign in
              </Link>
            )}
          </Container>
        </nav>
      ) : null}
    </header>
  );
}
