"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";

export function QuoteCartButton({ className }: { className?: string }) {
  const { itemCount, isReady } = useCart();

  return (
    <Link
      href="/quote"
      className={`relative inline-flex items-center gap-2 rounded-full border border-olive-200 px-4 py-2 text-sm font-medium text-olive-900 transition-colors hover:border-olive-400 hover:bg-olive-50 ${className ?? ""}`}
    >
      <ClipboardList className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Quote list</span>
      <span
        aria-hidden={!isReady || itemCount === 0}
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-olive-900 px-1.5 text-xs font-semibold text-white"
      >
        {isReady ? itemCount : 0}
      </span>
      <span className="sr-only">
        {isReady
          ? `Quote list, ${itemCount} item${itemCount === 1 ? "" : "s"}`
          : "Quote list"}
      </span>
    </Link>
  );
}
