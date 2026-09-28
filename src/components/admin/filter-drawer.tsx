"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, SlidersHorizontal, X } from "lucide-react";

import type { FilterOption } from "@/components/admin/column-filter";

interface Props {
  sourceOptions: FilterOption[];
  categoryOptions: FilterOption[];
  originOptions: FilterOption[];
  statusOptions: FilterOption[];
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="border-t border-olive-100 py-3">
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-olive-500 uppercase">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? "border-olive-800 bg-olive-800 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
            >
              {on ? <Check className="h-3 w-3" /> : null}
              {o.label}
              {o.count != null ? <span className={on ? "text-olive-200" : "text-olive-400"}>{o.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SORTS = [
  { value: "", label: "Featured (default)" },
  { value: "name:asc", label: "Name A → Z" },
  { value: "name:desc", label: "Name Z → A" },
  { value: "price:asc", label: "Price low → high" },
  { value: "price:desc", label: "Price high → low" },
  { value: "source:asc", label: "Source A → Z" },
  { value: "category:asc", label: "Category A → Z" },
];

/**
 * A combined filter panel for all columns + sort. The column-header funnels and
 * this drawer share the SAME URL query state; this is the primary path on
 * mobile, where the tiny header funnels are hard to tap. Apply writes every
 * choice to the URL at once and resets to page 1.
 */
export function FilterDrawer({ sourceOptions, categoryOptions, originOptions, statusOptions }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  const listOf = (k: string) => new Set((sp.get(k) || "").split(",").filter(Boolean));
  const [source, setSource] = useState<Set<string>>(listOf("source"));
  const [category, setCategory] = useState<Set<string>>(listOf("category"));
  const [origin, setOrigin] = useState<Set<string>>(listOf("origin"));
  const [status, setStatus] = useState<Set<string>>(listOf("status"));
  const curPrice = sp.get("price") || "any";
  const [price, setPrice] = useState(curPrice.startsWith("range") ? "range" : curPrice);
  const [min, setMin] = useState(sp.get("priceMin") || "");
  const [max, setMax] = useState(sp.get("priceMax") || "");
  const [sort, setSort] = useState(sp.get("sort") ? `${sp.get("sort")}:${sp.get("dir") || "asc"}` : "");

  const activeCount =
    listOf("source").size + listOf("category").size + listOf("origin").size + listOf("status").size + (sp.get("price") ? 1 : 0);

  // Re-sync draft from the URL whenever the drawer is opened.
  const openDrawer = () => {
    setSource(listOf("source"));
    setCategory(listOf("category"));
    setOrigin(listOf("origin"));
    setStatus(listOf("status"));
    const cp = sp.get("price") || "any";
    setPrice(cp.startsWith("range") ? "range" : cp);
    setMin(sp.get("priceMin") || "");
    setMax(sp.get("priceMax") || "");
    setSort(sp.get("sort") ? `${sp.get("sort")}:${sp.get("dir") || "asc"}` : "");
    setOpen(true);
  };

  const setMulti = (setter: (s: Set<string>) => void, cur: Set<string>, v: string) => {
    const n = new Set(cur);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  };

  const apply = () => {
    const p = new URLSearchParams(sp.toString());
    const put = (k: string, s: Set<string>) => (s.size ? p.set(k, [...s].join(",")) : p.delete(k));
    put("source", source);
    put("category", category);
    put("origin", origin);
    put("status", status);
    p.delete("priceMin");
    p.delete("priceMax");
    if (price === "any") p.delete("price");
    else if (price === "range") {
      p.set("price", "range");
      if (min) p.set("priceMin", min);
      if (max) p.set("priceMax", max);
    } else p.set("price", price);
    if (sort) {
      const [k, d] = sort.split(":");
      p.set("sort", k);
      p.set("dir", d);
    } else {
      p.delete("sort");
      p.delete("dir");
    }
    p.delete("page");
    router.push(`/admin/products?${p.toString()}`);
    setOpen(false);
  };

  const clearAll = () => {
    const p = new URLSearchParams();
    if (sp.get("q")) p.set("q", sp.get("q")!);
    router.push(`/admin/products${p.toString() ? `?${p}` : ""}`);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-olive-200 px-3 text-sm font-medium text-olive-700 hover:bg-olive-50"
      >
        <SlidersHorizontal className="h-4 w-4" /> Filter
        {activeCount > 0 ? <span className="rounded-full bg-olive-900 px-1.5 text-xs font-semibold text-white">{activeCount}</span> : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h2 className="font-display text-lg text-olive-900">Filters</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-olive-500 hover:bg-olive-50">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4">
              <div className="border-t border-olive-100 py-3 first:border-t-0">
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-olive-500 uppercase">Sort</p>
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="w-full rounded-lg border border-olive-200 px-3 py-2 text-sm">
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <FilterSection title="Source" options={sourceOptions} selected={source} onToggle={(v) => setMulti(setSource, source, v)} />
              <FilterSection title="Category" options={categoryOptions} selected={category} onToggle={(v) => setMulti(setCategory, category, v)} />
              <FilterSection title="Origin" options={originOptions} selected={origin} onToggle={(v) => setMulti(setOrigin, origin, v)} />
              <FilterSection title="Status" options={statusOptions} selected={status} onToggle={(v) => setMulti(setStatus, status, v)} />

              <div className="border-t border-olive-100 py-3">
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-olive-500 uppercase">Price</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ v: "any", l: "Any" }, { v: "has", l: "Has price" }, { v: "request", l: "On request" }, { v: "range", l: "Range" }].map((m) => (
                    <button key={m.v} type="button" onClick={() => setPrice(m.v)} className={`rounded-full border px-2.5 py-1 text-xs ${price === m.v ? "border-olive-800 bg-olive-800 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}>
                      {m.l}
                    </button>
                  ))}
                </div>
                {price === "range" ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-olive-400">$</span>
                    <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="Min" className="w-full rounded border border-olive-200 px-2 py-1.5 text-sm" />
                    <span className="text-olive-400">–</span>
                    <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="Max" className="w-full rounded border border-olive-200 px-2 py-1.5 text-sm" />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-olive-100 px-4 py-3">
              <button type="button" onClick={clearAll} className="text-sm font-medium text-olive-500 hover:text-olive-800">
                Clear all
              </button>
              <button type="button" onClick={apply} className="rounded-lg bg-olive-900 px-6 py-2 text-sm font-medium text-white hover:bg-olive-800">
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
