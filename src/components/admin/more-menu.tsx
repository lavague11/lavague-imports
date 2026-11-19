"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

// A small "⋯ More" dropdown. `children` receives a `close` callback so each row
// can dismiss the menu after firing its action. Opens upward-right so it clears
// the sticky bottom bar on the invoice screen.
export function MoreMenu({
  children,
  label = "More actions",
  triggerLabel,
}: {
  children: (close: () => void) => React.ReactNode;
  label?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white font-medium text-olive-700 hover:bg-olive-50 ${
          triggerLabel ? "px-3 py-1.5 text-sm" : "h-10 w-10 justify-center"
        }`}
      >
        <MoreHorizontal className="h-5 w-5" />
        {triggerLabel ? <span>{triggerLabel}</span> : null}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 bottom-full z-30 mb-1 w-56 overflow-hidden rounded-xl border border-olive-100 bg-white py-1 shadow-xl">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

// Shared styling for a row inside MoreMenu.
export const menuRowCls =
  "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-50";
