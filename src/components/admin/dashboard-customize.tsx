"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

const SECTIONS = [
  { k: "goal-trend", l: "Goal & revenue trend" },
  { k: "top-products", l: "Top products" },
  { k: "customers", l: "Customers" },
  { k: "collections", l: "Collections" },
  { k: "availability", l: "Check with supplier" },
  { k: "reps", l: "Sales reps" },
  { k: "needs-you", l: "Needs you" },
  { k: "activity", l: "Activity" },
  { k: "catalog", l: "Catalog health" },
];
const KEY = "lv_dash_hidden";

/** Hide/show dashboard sections, remembered per browser (DASHBOARD §1b). Applies
 *  by toggling the `display` of elements tagged with data-dash-section. */
export function DashboardCustomize() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setHidden(new Set(JSON.parse(localStorage.getItem(KEY) || "[]"))); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    for (const s of SECTIONS) {
      const el = document.querySelector<HTMLElement>(`[data-dash-section="${s.k}"]`);
      if (el) el.style.display = hidden.has(s.k) ? "none" : "";
    }
  }, [hidden]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const toggle = (k: string) => {
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      try { localStorage.setItem(KEY, JSON.stringify([...n])); } catch { /* ignore */ }
      return n;
    });
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 bg-white px-3 py-1.5 text-sm font-medium text-olive-700 hover:bg-olive-50">
        <SlidersHorizontal className="h-4 w-4" /> Customize
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-olive-100 bg-white p-2 shadow-lg">
          <p className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-olive-400 uppercase">Show sections</p>
          {SECTIONS.map((s) => (
            <label key={s.k} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-olive-800 hover:bg-olive-50">
              <input type="checkbox" checked={!hidden.has(s.k)} onChange={() => toggle(s.k)} className="h-4 w-4 accent-olive-800" />
              {s.l}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
