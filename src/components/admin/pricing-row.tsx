"use client";

import { useState } from "react";

import { setPricing } from "@/app/admin/actions";
import { profitMargin } from "@/lib/pricing";

export interface PricingRowData {
  slug: string;
  name: string;
  sku: string;
  size: string;
  source: string;
  marketCents: number | null;
  suggestedCents: number | null;
  priceCents: number | null;
  costCents: number | null;
}

const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const toStr = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
const toCents = (v: string) => {
  const n = parseFloat(v);
  return v.trim() !== "" && Number.isFinite(n) ? Math.round(n * 100) : null;
};

const cellInput =
  "h-8 w-20 rounded-md border border-olive-200 px-2 text-right text-sm focus:border-olive-500 focus:outline-none";

export function PricingRow({ row }: { row: PricingRowData }) {
  const formId = `pf-${row.slug}`;
  const [cost, setCost] = useState(toStr(row.costCents));
  const [price, setPrice] = useState(toStr(row.priceCents));

  const { profitCents, marginPct } = profitMargin(toCents(price), toCents(cost));
  const marginColor =
    marginPct == null ? "text-olive-400" : marginPct < 0 ? "text-red-600" : marginPct < 20 ? "text-amber-600" : "text-emerald-700";

  return (
    <tr className="border-b border-olive-50 last:border-0">
      <td className="max-w-[16rem] p-2">
        <div className="truncate font-medium text-olive-900">{row.name}</div>
        <div className="text-xs text-olive-400">
          {row.size}
          {row.source ? ` · ${row.source}` : ""}
        </div>
      </td>
      <td className="p-2 text-right text-olive-600">{money(row.marketCents)}</td>
      <td className="p-2 text-right">
        {row.suggestedCents != null ? (
          <button
            type="button"
            onClick={() => setPrice(toStr(row.suggestedCents))}
            title="Use this suggested price"
            className="rounded-md border border-olive-200 px-1.5 py-0.5 text-xs text-olive-700 hover:border-olive-400 hover:bg-olive-50"
          >
            {money(row.suggestedCents)}
          </button>
        ) : (
          <span className="text-olive-300">—</span>
        )}
      </td>
      <td className="p-2 text-right">
        <span className="text-olive-400">$</span>
        <input
          form={formId}
          name="cost"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className={cellInput}
        />
      </td>
      <td className="p-2 text-right">
        <span className="text-olive-400">$</span>
        <input
          form={formId}
          name="price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className={cellInput}
        />
      </td>
      <td className={`p-2 text-right ${profitCents != null && profitCents < 0 ? "text-red-600" : "text-olive-700"}`}>
        {money(profitCents)}
      </td>
      <td className={`p-2 text-right font-medium ${marginColor}`}>
        {marginPct == null ? "—" : `${marginPct.toFixed(0)}%`}
      </td>
      <td className="p-2 text-right">
        <form id={formId} action={setPricing}>
          <input type="hidden" name="slug" value={row.slug} />
          <input type="hidden" name="sku" value={row.sku} />
          <button className="rounded-md bg-olive-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-olive-800">
            Save
          </button>
        </form>
      </td>
    </tr>
  );
}
