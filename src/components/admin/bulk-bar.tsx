"use client";

import { useEffect, useState } from "react";

// Bulk-action bar for the products list. It owns the #bulk form that the row
// checkboxes submit to, but only reveals itself once something is selected —
// a bottom sheet on mobile, an inline bar on desktop.
export function BulkBar({ action }: { action: (fd: FormData) => void | Promise<void> }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const boxes = () => document.querySelectorAll<HTMLInputElement>('input[name="slug"][data-bulk="1"]');
    const recount = () => {
      let n = 0;
      boxes().forEach((b) => { if (b.checked) n++; });
      setCount(n);
    };
    document.addEventListener("change", recount);
    recount();
    return () => document.removeEventListener("change", recount);
  }, []);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>('input[name="slug"][data-bulk="1"]').forEach((b) => { b.checked = false; });
    setCount(0);
  };

  return (
    <form
      id="bulk"
      action={action}
      className={`${count ? "flex" : "hidden"} fixed inset-x-0 bottom-0 z-40 items-center gap-2 border-t border-olive-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:static lg:mt-4 lg:mb-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none`}
    >
      <span className="text-sm font-medium text-olive-700">{count} selected</span>
      <button name="action" value="show" className="rounded-md border border-olive-300 px-3 py-1.5 text-sm hover:bg-olive-50">Show</button>
      <button name="action" value="hide" className="rounded-md border border-olive-300 px-3 py-1.5 text-sm hover:bg-olive-50">Hide</button>
      <button type="button" onClick={clear} className="ml-auto text-sm text-olive-500 underline underline-offset-2 hover:text-olive-800">Clear</button>
    </form>
  );
}
