"use client";

import { useEffect, useRef, useState } from "react";

interface Info {
  lastPriceCents: number | null;
  lastDate: string | null;
  catalogPriceCents: number | null;
  history: { priceCents: number; date: string }[];
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

// Shows "Last paid $X · date" (or "Catalog price"), auto-fills the price when the line
// has none yet, and turns amber/red when the entered price drifts from the base.
export function PriceHint({
  customerId,
  name,
  price,
  isCredit,
  onAutoFill,
}: {
  customerId: string | null;
  name: string;
  price: string;
  isCredit?: boolean;
  onAutoFill: (value: string) => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const lastNameRef = useRef("");

  useEffect(() => {
    const n = name.trim();
    if (isCredit || n.length < 3) { setInfo(null); setBase(null); return; }
    const t = setTimeout(async () => {
      try {
        const u = new URL("/admin/invoices/price-history", window.location.origin);
        if (customerId) u.searchParams.set("customerId", customerId);
        u.searchParams.set("name", n);
        const d: Info = await (await fetch(u.toString())).json();
        const b = d.lastPriceCents ?? d.catalogPriceCents;
        if (b == null) { setInfo(null); setBase(null); return; }
        setInfo(d);
        setBase(b);
        // Auto-fill only when the price is empty and this is a freshly recognised item.
        if (!price.trim() && lastNameRef.current !== n) onAutoFill((b / 100).toFixed(2));
        lastNameRef.current = n;
      } catch {
        /* ignore */
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, customerId, isCredit]);

  if (isCredit || !info || base == null) return null;

  const cur = Math.round((parseFloat(price) || 0) * 100);
  const entered = price.trim().length > 0;
  const diff = cur - base;
  const pct = base ? Math.abs(diff) / base : 0;
  const changed = entered && diff !== 0;
  const color = changed ? (pct > 0.3 ? "text-red-600" : "text-amber-600") : "text-olive-400";
  const label = info.lastPriceCents != null ? `Last paid ${money(info.lastPriceCents)}${info.lastDate ? ` · ${info.lastDate}` : ""}` : "Catalog price";

  return (
    <div className="relative mt-0.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`block max-w-full truncate text-left text-[11px] ${color} hover:underline`}>
        {label}{changed ? ` (${diff > 0 ? "+" : "−"}${money(Math.abs(diff))})` : ""}
      </button>
      {open && info.history.length ? (
        <div className="absolute z-30 mt-1 w-40 rounded-lg border border-olive-100 bg-white p-2 shadow-lg" onMouseLeave={() => setOpen(false)}>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-olive-400">Last {info.history.length}</p>
          <ul className="space-y-0.5 text-xs text-olive-700">
            {info.history.map((h, i) => (
              <li key={i} className="flex justify-between"><span>{money(h.priceCents)}</span><span className="text-olive-400">{h.date}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
