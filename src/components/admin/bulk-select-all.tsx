"use client";

import { useEffect, useRef } from "react";

// Header checkbox for the products table. Toggles every row checkbox on the
// current page and reflects an indeterminate state when only some are checked.
// It talks to the row checkboxes (and BulkBar) purely through the DOM + a
// dispatched "change" event, so no shared state/provider is needed.
const SELECTOR = 'input[name="slug"][data-bulk="1"]';

export function BulkSelectAllCheckbox() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(SELECTOR));
    const sync = () => {
      const all = boxes();
      const checked = all.filter((b) => b.checked).length;
      if (ref.current) {
        ref.current.checked = all.length > 0 && checked === all.length;
        ref.current.indeterminate = checked > 0 && checked < all.length;
      }
    };
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);

  const toggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const on = e.currentTarget.checked;
    document.querySelectorAll<HTMLInputElement>(SELECTOR).forEach((b) => {
      b.checked = on;
    });
    // Let BulkBar (and this component's sync) recount.
    document.dispatchEvent(new Event("change", { bubbles: true }));
  };

  return (
    <input
      ref={ref}
      type="checkbox"
      onChange={toggle}
      aria-label="Select all on this page"
      className="h-4 w-4 accent-olive-800"
    />
  );
}
