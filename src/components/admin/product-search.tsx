"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Live, type-as-you-go product search. Debounces (~300 ms) and rewrites the `q`
 * URL param, preserving every other filter/sort and resetting to page 1. No
 * Search button — the list filters while you type.
 */
export function ProductSearch() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync when the URL `q` changes from elsewhere (e.g. a chip
  // cleared it) and the box isn't mid-edit.
  useEffect(() => {
    setValue((v) => (v === urlQ ? v : urlQ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const push = (next: string) => {
    const p = new URLSearchParams(sp.toString());
    const trimmed = next.trim();
    if (trimmed) p.set("q", trimmed);
    else p.delete("q");
    p.delete("page");
    const qs = p.toString();
    router.replace(qs ? `/admin/products?${qs}` : "/admin/products");
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), 300);
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setValue("");
    push("");
  };

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search products…"
        aria-label="Search products"
        className="h-10 w-full rounded-lg border border-olive-200 pl-9 pr-9 text-sm focus:border-olive-500 focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-olive-400 hover:bg-olive-50 hover:text-olive-700"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
