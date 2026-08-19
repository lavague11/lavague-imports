"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Grows the shop listing in place. A sentinel auto-loads the next batch as it
 * scrolls into view (infinite scroll); the button is a no-JS / manual fallback.
 * Both bump the `show` search param via a soft navigation, so the server
 * re-renders more product cards without a full reload.
 */
export function ShowMore({
  nextCount,
  remaining,
  pageSize,
}: {
  nextCount: number;
  remaining: number;
  pageSize: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  function loadMore() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("show", String(nextCount));
    startTransition(() => {
      router.replace(`/shop?${params.toString()}`, { scroll: false });
    });
  }

  // Auto-load when the sentinel nears the viewport. Re-arms after each batch
  // because `nextCount` changes, so it keeps loading while the user scrolls.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || isPending) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("show", String(nextCount));
          startTransition(() => {
            router.replace(`/shop?${params.toString()}`, { scroll: false });
          });
        }
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCount, isPending, searchParams, router]);

  return (
    <div className="mt-12 flex flex-col items-center gap-3 border-t border-olive-100 pt-8">
      <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
      <button
        type="button"
        onClick={loadMore}
        disabled={isPending}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-olive-300 bg-white px-8 text-sm font-medium text-olive-900 transition-colors hover:border-olive-500 hover:bg-olive-50 disabled:opacity-60"
      >
        {isPending ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-olive-300 border-t-olive-700" />
            Loading…
          </>
        ) : (
          `Show more (${Math.min(pageSize, remaining)} of ${remaining} left)`
        )}
      </button>
    </div>
  );
}
