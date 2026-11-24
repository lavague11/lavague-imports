"use client";

import { useMemo, useState } from "react";

export interface QuoteEditorLine {
  id: string;
  productName: string;
  unitSize: string | null;
  casePack: number | null;
  cases: number;
  priceDollars: string; // prefill ("" if none)
}

interface Props {
  orderId: string;
  status: string;
  lines: QuoteEditorLine[];
  discountDollars: string;
  shippingDollars: string;
  taxDollars: string;
}

/** Lenient dollars → cents, mirroring the server's dollarsToCents. */
function toCents(s: string): number {
  const cleaned = s.replace(/[$,\s]/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function QuoteEditor({ orderId, status, lines, discountDollars, shippingDollars, taxDollars }: Props) {
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, l.priceDollars])),
  );
  const [discount, setDiscount] = useState(discountDollars);
  const [shipping, setShipping] = useState(shippingDollars);
  const [tax, setTax] = useState(taxDollars);

  const { subtotal, total, lineTotals } = useMemo(() => {
    const lt: Record<string, number> = {};
    let sub = 0;
    for (const l of lines) {
      const t = toCents(prices[l.id] ?? "") * l.cases;
      lt[l.id] = t;
      sub += t;
    }
    const tot = Math.max(0, sub - toCents(discount) + toCents(shipping) + toCents(tax));
    return { subtotal: sub, total: tot, lineTotals: lt };
  }, [prices, discount, shipping, tax, lines]);

  const reSend = status === "QUOTED" || status === "CHANGES_REQUESTED";
  const num =
    "h-9 w-28 rounded-lg border border-olive-200 px-2 text-right text-sm focus:border-olive-500 focus:outline-none";

  return (
    <form action={`/admin/orders/${orderId}/quote`} method="post" className="mt-5">
      <div className="overflow-hidden rounded-xl border border-olive-100 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Unit</th>
              <th className="p-3 text-right">Cases</th>
              <th className="p-3 text-right">Price / case</th>
              <th className="p-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-olive-50 last:border-0">
                <td className="p-3 font-medium text-olive-900">{l.productName}</td>
                <td className="p-3 text-olive-600">
                  {[l.unitSize, l.casePack ? `${l.casePack}/case` : null].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="p-3 text-right text-olive-800">{l.cases}</td>
                <td className="p-3 text-right">
                  <span className="mr-1 text-olive-400">$</span>
                  <input
                    name={`price_${l.id}`}
                    inputMode="decimal"
                    value={prices[l.id] ?? ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
                    placeholder="0.00"
                    className={num}
                    aria-label={`Price per case for ${l.productName}`}
                  />
                </td>
                <td className="p-3 text-right font-medium text-olive-900">{fmt(lineTotals[l.id] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col items-end gap-1.5 text-sm">
        <div className="flex w-full max-w-xs items-center justify-between">
          <span className="text-olive-600">Subtotal</span>
          <span className="font-medium text-olive-900">{fmt(subtotal)}</span>
        </div>
        {([
          ["Discount", discount, setDiscount, "discount"],
          ["Shipping", shipping, setShipping, "shipping"],
          ["Tax", tax, setTax, "tax"],
        ] as const).map(([label, val, set, name]) => (
          <div key={name} className="flex w-full max-w-xs items-center justify-between">
            <label htmlFor={`adj-${name}`} className="text-olive-600">{label}</label>
            <span>
              <span className="mr-1 text-olive-400">$</span>
              <input
                id={`adj-${name}`}
                name={name}
                inputMode="decimal"
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder="0.00"
                className={num}
              />
            </span>
          </div>
        ))}
        <div className="mt-1 flex w-full max-w-xs items-center justify-between border-t border-olive-100 pt-2">
          <span className="font-medium text-olive-800">Total</span>
          <span className="text-base font-semibold text-olive-900">{fmt(total)}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="action"
          value="save"
          className="rounded-lg border border-olive-300 bg-white px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50"
        >
          Save draft
        </button>
        <button
          type="submit"
          name="action"
          value="send"
          className="rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800"
        >
          {reSend ? "Re-send quote" : "Send quote"}
        </button>
        <p className="text-sm text-olive-500">
          Saving keeps it private; sending shows the customer the quote to approve. Customers never see prices until you send.
        </p>
      </div>
    </form>
  );
}
