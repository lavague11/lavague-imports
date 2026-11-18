"use client";

import { useRouter, useSearchParams } from "next/navigation";

const RANGES = [
  { k: "today", l: "Today" },
  { k: "7d", l: "7 days" },
  { k: "30d", l: "30 days" },
  { k: "month", l: "This month" },
  { k: "year", l: "This year" },
  { k: "custom", l: "Custom" },
];

/** Dashboard date-range picker (DASHBOARD §1b). Drives the money cards and the
 *  range-based sections via ?range= (+ ?from/?to for custom). */
export function DateRangePicker({ current, from, to }: { current: string; from?: string; to?: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (params: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`/admin?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {RANGES.map((r) => (
        <button
          key={r.k}
          type="button"
          onClick={() => go({ range: r.k, ...(r.k === "custom" ? {} : { from: null, to: null }) })}
          className={`rounded-full border px-2.5 py-1 text-xs ${current === r.k ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
        >
          {r.l}
        </button>
      ))}
      {current === "custom" ? (
        <span className="inline-flex items-center gap-1 text-xs text-olive-600">
          <input type="date" defaultValue={from} onChange={(e) => go({ range: "custom", from: e.target.value })} className="rounded border border-olive-200 px-1.5 py-1 text-xs" />
          <span>–</span>
          <input type="date" defaultValue={to} onChange={(e) => go({ range: "custom", to: e.target.value })} className="rounded border border-olive-200 px-1.5 py-1 text-xs" />
        </span>
      ) : null}
    </div>
  );
}
