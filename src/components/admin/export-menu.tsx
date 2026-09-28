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

  const exportCurrent = (format: "csv" | "xlsx") => {
    const p = new URLSearchParams(sp.toString());
    p.delete("page");
    p.delete("pageSize");
    if (format === "xlsx") p.set("format", "xlsx");
    // Full navigation (not router.push) so the file attachment downloads.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/admin/products/export?${p.toString()}`;
    setOpen(false);
  };

  const exportSelected = (format: "csv" | "xlsx") => {
    const slugs = checkedSlugs();
    if (!slugs.length) {
      setCount(-1);
      return;
    }
    const p = new URLSearchParams();
    p.set("slugs", slugs.join(","));
    if (format === "xlsx") p.set("format", "xlsx");
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
          <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-olive-400 uppercase">Current view</p>
          <button type="button" onClick={() => exportCurrent("csv")} className="block w-full px-3 py-2 text-left text-sm text-olive-700 hover:bg-olive-50">
            CSV
          </button>
          <button type="button" onClick={() => exportCurrent("xlsx")} className="block w-full px-3 py-2 text-left text-sm text-olive-700 hover:bg-olive-50">
            Excel (XLSX)
          </button>
          <p className="border-t border-olive-100 px-3 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-olive-400 uppercase">
            Selected{count > 0 ? ` (${count})` : ""}
          </p>
          <button type="button" onClick={() => exportSelected("csv")} className="block w-full px-3 py-2 text-left text-sm text-olive-700 hover:bg-olive-50">
            CSV
          </button>
          <button type="button" onClick={() => exportSelected("xlsx")} className="block w-full px-3 py-2 text-left text-sm text-olive-700 hover:bg-olive-50">
            Excel (XLSX)
          </button>
          {count === -1 ? <p className="px-3 py-1.5 text-xs text-amber-700">Tick some rows first.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
