"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Download } from "lucide-react";

/**
 * Export the products list as CSV. "Current view" respects every active
 * filter/search/sort (it forwards the same query params to the export route).
 * "Selected" exports only the checked rows.
 */
export function ExportMenu() {
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const checkedSlugs = () =>
    [...document.querySelectorAll<HTMLInputElement>('input[name="slug"]:checked')].map((el) => el.value);

  const exportCurrent = () => {
    const p = new URLSearchParams(sp.toString());
    p.delete("page");
    p.delete("pageSize");
    // Full navigation (not router.push) so the CSV attachment downloads.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/admin/products/export?${p.toString()}`;
    setOpen(false);
  };

  const exportSelected = () => {
    const slugs = checkedSlugs();
    if (!slugs.length) {
      setCount(-1);
      return;
    }
    const p = new URLSearchParams();
    p.set("slugs", slugs.join(","));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/admin/products/export?${p.toString()}`;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setCount(checkedSlugs().length);
          setOpen((o) => !o);
        }}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-olive-200 px-3 text-sm font-medium text-olive-700 hover:bg-olive-50"
        aria-expanded={open}
      >
        <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-olive-100 bg-white py-1 shadow-lg">
          <button type="button" onClick={exportCurrent} className="block w-full px-3 py-2 text-left text-sm text-olive-700 hover:bg-olive-50">
            Current view (CSV)
          </button>
          <button
            type="button"
            onClick={exportSelected}
            className="block w-full px-3 py-2 text-left text-sm text-olive-700 hover:bg-olive-50"
          >
            Selected {count > 0 ? `(${count}) ` : ""}(CSV)
          </button>
          {count === -1 ? (
            <p className="px-3 py-1.5 text-xs text-amber-700">Tick some rows first.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
