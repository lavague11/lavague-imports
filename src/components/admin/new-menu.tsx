"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, FileText, UserPlus, Package } from "lucide-react";

/** Dashboard "New" button → a centered modal offering the three things an admin
 *  creates most: an invoice, a customer, or a product. "New invoice" posts a
 *  blank draft (host-safe full-page POST) and opens its editor; the other two
 *  deep-link to their create flows. */
export function NewMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-olive-800"
      >
        <Plus className="h-4 w-4" /> New
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-olive-100 px-5 py-3.5">
              <h2 className="font-display text-lg text-olive-900">Create new</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-olive-400 hover:text-olive-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 p-4">
              {/* New invoice — posts a blank draft and 303s to its editor. */}
              <form method="post" action="/admin/invoices/create">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl border border-olive-100 px-4 py-3 text-left hover:border-olive-300 hover:bg-olive-50/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-olive-100 text-olive-800">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-olive-900">New invoice</span>
                    <span className="block text-xs text-olive-500">Start a blank draft</span>
                  </span>
                </button>
              </form>

              <Link
                href="/admin/customers?add=1"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl border border-olive-100 px-4 py-3 text-left hover:border-olive-300 hover:bg-olive-50/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-olive-100 text-olive-800">
                  <UserPlus className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-olive-900">New customer</span>
                  <span className="block text-xs text-olive-500">Add a wholesale account</span>
                </span>
              </Link>

              <Link
                href="/admin/products/new"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl border border-olive-100 px-4 py-3 text-left hover:border-olive-300 hover:bg-olive-50/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-olive-100 text-olive-800">
                  <Package className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-olive-900">New product</span>
                  <span className="block text-xs text-olive-500">Create a catalog item</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
