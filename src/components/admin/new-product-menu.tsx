"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, ChevronDown, Images, Plus } from "lucide-react";

/**
 * The "+ New" chooser (PRODUCTS_UI §2). Opens a small popover offering:
 *  - One item      → the single-product form (/admin/products/new)
 *  - Bulk (photos) → the eBay-style bulk add (§4), shown as "Soon" until built
 */
export function NewProductMenu({ floating = false }: { floating?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      {floating ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="New product"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-olive-900 text-white shadow-lg hover:bg-olive-800"
        >
          <Plus className="h-6 w-6" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex h-10 items-center gap-1 rounded-lg bg-olive-900 pl-3 pr-2.5 text-sm font-medium text-white hover:bg-olive-800"
        >
          <Plus className="h-4 w-4" /> New
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open ? (
        <div
          role="menu"
          className={`absolute right-0 z-50 w-64 overflow-hidden rounded-xl border border-olive-100 bg-white p-1 shadow-lg ${floating ? "bottom-full mb-2" : "mt-1"}`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/admin/products/new");
            }}
            className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-olive-50"
          >
            <Box className="mt-0.5 h-5 w-5 shrink-0 text-olive-700" />
            <span>
              <span className="block text-sm font-medium text-olive-900">One item</span>
              <span className="block text-xs text-olive-500">Add a single product</span>
            </span>
          </button>

          <div
            role="menuitem"
            aria-disabled="true"
            title="Bulk photo add is coming soon"
            className="flex w-full cursor-not-allowed items-start gap-3 rounded-lg px-3 py-2.5 text-left opacity-60"
          >
            <Images className="mt-0.5 h-5 w-5 shrink-0 text-olive-400" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-olive-700">Bulk (many photos)</span>
                <span className="rounded-full bg-olive-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-olive-600 uppercase">Soon</span>
              </span>
              <span className="block text-xs text-olive-500">Upload photos, AI groups them</span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
