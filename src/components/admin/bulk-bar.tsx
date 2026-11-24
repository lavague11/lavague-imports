"use client";

import { useEffect, useState } from "react";

// Bulk-action bar for the products list. It owns the #bulk form that the row
// checkboxes submit to, but only reveals itself once something is selected —
// a bottom sheet on mobile, an inline bar on desktop.
//
// Two selection scopes:
//  • the checked rows on this page (the default), or
//  • "all N results" matching the current filter/search — when every row on the
//    page is checked we offer this, and on submit we pass the current filter
//    querystring so the server re-resolves the full set (not just this page).
export function BulkBar({
  action,
  brands = [],
  total,
  filterParams = {},
}: {
  action: (fd: FormData) => void | Promise<void>;
  brands?: string[];
  total: number;
  filterParams?: Record<string, string>;
}) {
  const [count, setCount] = useState(0);
  const [pageTotal, setPageTotal] = useState(0);
  const [allMatching, setAllMatching] = useState(false);
  const [brandMode, setBrandMode] = useState(false);

  useEffect(() => {
    const boxes = () => document.querySelectorAll<HTMLInputElement>('input[name="slug"][data-bulk="1"]');
    const recount = () => {
      const all = boxes();
      let n = 0;
      all.forEach((b) => { if (b.checked) n++; });
      setCount(n);
      setPageTotal(all.length);
      if (n === 0) { setBrandMode(false); setAllMatching(false); }
      // Selecting fewer than the whole page cancels a "select all results" scope.
      if (n < all.length) setAllMatching(false);
    };
    document.addEventListener("change", recount);
    recount();
    return () => document.removeEventListener("change", recount);
  }, []);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>('input[name="slug"][data-bulk="1"]').forEach((b) => { b.checked = false; });
    setCount(0);
    setBrandMode(false);
    setAllMatching(false);
    document.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const pageAllChecked = pageTotal > 0 && count === pageTotal;
  const moreBeyondPage = total > pageTotal;
  const filterQs = new URLSearchParams(filterParams).toString();

  return (
    <form
      id="bulk"
      action={action}
      className={`${count ? "flex" : "hidden"} fixed inset-x-0 bottom-0 z-40 flex-wrap items-center gap-2 border-t border-olive-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:static lg:mt-4 lg:mb-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none`}
    >
      {allMatching ? (
        <>
          <span className="text-sm font-medium text-olive-800">All {total.toLocaleString()} results selected</span>
          <input type="hidden" name="allMatching" value="1" />
          <input type="hidden" name="filterQs" value={filterQs} />
        </>
      ) : (
        <span className="text-sm font-medium text-olive-700">{count} selected</span>
      )}

      {/* Offer to extend the selection to the whole filtered set. */}
      {!allMatching && pageAllChecked && moreBeyondPage ? (
        <button
          type="button"
          onClick={() => setAllMatching(true)}
          className="rounded-md border border-olive-300 px-3 py-1.5 text-sm font-medium text-olive-800 underline-offset-2 hover:bg-olive-50"
        >
          Select all {total.toLocaleString()} results
        </button>
      ) : null}

      {brandMode ? (
        <>
          <input
            name="brand"
            list="bulk-brands"
            autoFocus
            placeholder="Brand (blank = clear)"
            className="h-8 rounded-md border border-olive-300 px-2 text-sm focus:border-olive-500 focus:outline-none"
          />
          <button name="action" value="setBrand" className="rounded-md bg-olive-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-olive-800">Apply</button>
          <button type="button" onClick={() => setBrandMode(false)} className="text-sm text-olive-500 hover:text-olive-800">Cancel</button>
        </>
      ) : (
        <>
          <button name="action" value="show" className="rounded-md border border-olive-300 px-3 py-1.5 text-sm hover:bg-olive-50">Show</button>
          <button name="action" value="hide" className="rounded-md border border-olive-300 px-3 py-1.5 text-sm hover:bg-olive-50">Hide</button>
          <button type="button" onClick={() => setBrandMode(true)} className="rounded-md border border-olive-300 px-3 py-1.5 text-sm hover:bg-olive-50">Set brand</button>
        </>
      )}
      <button type="button" onClick={clear} className="ml-auto text-sm text-olive-500 underline underline-offset-2 hover:text-olive-800">Clear</button>
      {brands.length ? <datalist id="bulk-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist> : null}
    </form>
  );
}
