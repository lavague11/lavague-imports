"use client";

import { useEffect, useState } from "react";

// Bulk-action bar for the products list. It owns the #bulk form that the row
// checkboxes submit to, but only reveals itself once something is selected —
// a bottom sheet on mobile, an inline bar on desktop.
export function BulkBar({ action, brands = [] }: { action: (fd: FormData) => void | Promise<void>; brands?: string[] }) {
  const [count, setCount] = useState(0);
  const [brandMode, setBrandMode] = useState(false);

  useEffect(() => {
    const boxes = () => document.querySelectorAll<HTMLInputElement>('input[name="slug"][data-bulk="1"]');
    const recount = () => {
      let n = 0;
      boxes().forEach((b) => { if (b.checked) n++; });
      setCount(n);
      if (n === 0) setBrandMode(false);
    };
    document.addEventListener("change", recount);
    recount();
    return () => document.removeEventListener("change", recount);
  }, []);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>('input[name="slug"][data-bulk="1"]').forEach((b) => { b.checked = false; });
    setCount(0);
    setBrandMode(false);
  };

  return (
    <form
      id="bulk"
      action={action}
      className={`${count ? "flex" : "hidden"} fixed inset-x-0 bottom-0 z-40 flex-wrap items-center gap-2 border-t border-olive-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:static lg:mt-4 lg:mb-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none`}
    >
      <span className="text-sm font-medium text-olive-700">{count} selected</span>
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
