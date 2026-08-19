"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Grows the shop listing in place. Bumps the `show` search param via a soft
 * navigation (scroll preserved), so the server re-renders more product cards
 * without a full reload — the "Show more" feel without an API route.
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

  function showMore() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("show", String(nextCount));
    startTransition(() => {
      router.replace(`/shop?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="mt-12 flex flex-col items-center gap-3 border-t border-olive-100 pt-8">
      <button
        type="button"
        onClick={showMore}
        disabled={isPending}
        className="inline-flex h-11 items-center justify-center rounded-full border border-olive-300 bg-white px-8 text-sm font-medium text-olive-900 transition-colors hover:border-olive-500 hover:bg-olive-50 disabled:opacity-60"
      >
        {isPending
          ? "Loading…"
          : `Show more (${Math.min(pageSize, remaining)} of ${remaining} left)`}
      </button>
    </div>
  );
}
