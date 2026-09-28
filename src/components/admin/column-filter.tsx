"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Filter } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

/**
 * A column-header filter funnel. Opens a compact popover; Apply pushes the
 * choice into the URL query (comma-separated) and resets to page 1, so all
 * filtering/sorting/pagination stays on one server-side query. Sort stays a
 * separate control (the label link) — this only filters.
 */
export function ColumnFilter(
  props:
    | { kind: "multi"; param: string; label: string; options: FilterOption[]; searchable?: boolean }
    | { kind: "price"; label: string },
) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pushParams = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mut(p);
    p.delete("page"); // any filter change resets to page 1
    router.push(`/admin/products?${p.toString()}`);
    setOpen(false);
  };

  // ---- active state (for the funnel highlight + count) ----
  let activeCount = 0;
  if (props.kind === "multi") {
    activeCount = (sp.get(props.param) || "").split(",").filter(Boolean).length;
  } else {
    activeCount = sp.get("price") ? 1 : 0;
  }
  const active = activeCount > 0;

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Filter by ${props.label}`}
        className={`ml-1 inline-flex h-6 items-center gap-0.5 rounded px-1 ${
          active ? "bg-olive-900 text-white" : "text-olive-400 hover:bg-olive-100 hover:text-olive-700"
        }`}
      >
        <Filter className="h-3.5 w-3.5" />
        {activeCount > 1 ? <span className="text-[10px] font-semibold">{activeCount}</span> : null}
      </button>

      {open ? (
        <div className="absolute top-7 left-0 z-50 w-56 rounded-lg border border-olive-100 bg-white p-2 text-left font-normal text-olive-800 shadow-xl">
          <p className="px-1 pb-1.5 text-xs font-semibold tracking-wide text-olive-500 uppercase">{props.label}</p>
          {props.kind === "multi" ? (
            <MultiBody {...props} sp={sp} onApply={pushParams} />
          ) : (
            <PriceBody sp={sp} onApply={pushParams} />
          )}
        </div>
      ) : null}
    </span>
  );
}

function MultiBody({
  param,
  options,
  searchable,
  sp,
  onApply,
}: {
  param: string;
  options: FilterOption[];
  searchable?: boolean;
  sp: URLSearchParams;
  onApply: (mut: (p: URLSearchParams) => void) => void;
}) {
  const initial = new Set((sp.get(param) || "").split(",").filter(Boolean));
  const [sel, setSel] = useState<Set<string>>(initial);
  const [q, setQ] = useState("");
  const shown = searchable && q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  const toggle = (v: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });

  return (
    <div>
      {searchable ? (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="mb-1.5 w-full rounded border border-olive-200 px-2 py-1 text-xs focus:border-olive-400 focus:outline-none"
        />
      ) : null}
      <div className="max-h-56 overflow-auto">
        {shown.map((o) => {
          const on = sel.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-olive-50"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-olive-800 bg-olive-800 text-white" : "border-olive-300"}`}>
                {on ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="flex-1 truncate">{o.label}</span>
              {o.count != null ? <span className="text-xs text-olive-400">{o.count}</span> : null}
            </button>
          );
        })}
        {shown.length === 0 ? <p className="px-1 py-2 text-xs text-olive-400">No options</p> : null}
      </div>
      <div className="mt-2 flex justify-between border-t border-olive-100 pt-2">
        <button type="button" onClick={() => onApply((p) => p.delete(param))} className="text-xs text-olive-500 hover:text-olive-800">
          Clear
        </button>
        <button
          type="button"
          onClick={() => onApply((p) => (sel.size ? p.set(param, [...sel].join(",")) : p.delete(param)))}
          className="rounded bg-olive-800 px-3 py-1 text-xs font-medium text-white hover:bg-olive-900"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function PriceBody({
  sp,
  onApply,
}: {
  sp: URLSearchParams;
  onApply: (mut: (p: URLSearchParams) => void) => void;
}) {
  const cur = sp.get("price") || "any";
  const [mode, setMode] = useState(cur.startsWith("range") ? "range" : cur);
  const [min, setMin] = useState(sp.get("priceMin") || "");
  const [max, setMax] = useState(sp.get("priceMax") || "");

  const modes = [
    { v: "any", label: "Any price" },
    { v: "has", label: "Has a price" },
    { v: "request", label: "Price on request" },
    { v: "range", label: "Custom range" },
  ];

  return (
    <div>
      <div className="space-y-0.5">
        {modes.map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => setMode(m.v)}
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-olive-50"
          >
            <span className={`h-3.5 w-3.5 rounded-full border ${mode === m.v ? "border-4 border-olive-800" : "border border-olive-300"}`} />
            {m.label}
          </button>
        ))}
      </div>
      {mode === "range" ? (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-xs text-olive-400">$</span>
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="Min" className="w-full rounded border border-olive-200 px-2 py-1 text-xs focus:outline-none" />
          <span className="text-xs text-olive-400">–</span>
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="Max" className="w-full rounded border border-olive-200 px-2 py-1 text-xs focus:outline-none" />
        </div>
      ) : null}
      <div className="mt-2 flex justify-between border-t border-olive-100 pt-2">
        <button type="button" onClick={() => onApply((p) => { p.delete("price"); p.delete("priceMin"); p.delete("priceMax"); })} className="text-xs text-olive-500 hover:text-olive-800">
          Clear
        </button>
        <button
          type="button"
          onClick={() =>
            onApply((p) => {
              p.delete("priceMin");
              p.delete("priceMax");
              if (mode === "any") p.delete("price");
              else if (mode === "range") {
                p.set("price", "range");
                if (min) p.set("priceMin", min);
                if (max) p.set("priceMax", max);
              } else p.set("price", mode);
            })
          }
          className="rounded bg-olive-800 px-3 py-1 text-xs font-medium text-white hover:bg-olive-900"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
