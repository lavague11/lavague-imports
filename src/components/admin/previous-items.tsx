"use client";

import { useMemo, useState } from "react";
import { Check, History, RotateCcw, Search, X } from "lucide-react";

interface PrevItem {
  description: string;
  name: string;
  brand: string;
  sku: string;
  imageUrl: string | null;
  lastQty: number;
  lastPriceCents: number | null;
  lastOrderISO: string;
  lastOrderLabel: string;
  timesOrdered: number;
  inCatalog: boolean;
}
interface LastOrder { number: string; label: string; lines: { description: string; quantity: number; unitPriceCents: number }[] }

export interface InvoiceLineInput { description: string; quantity: number; unitPriceCents: number }

const money = (c: number | null) => (c != null ? `$${(c / 100).toFixed(2)}` : "—");

export function PreviousItems({ customerId, onAdd, renderTrigger }: { customerId: string | null; onAdd: (lines: InvoiceLineInput[]) => void; renderTrigger?: (open: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PrevItem[]>([]);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    if (!customerId) { setNote("Pick a customer first."); return; }
    setNote(null);
    setOpen(true);
    setLoading(true);
    setPicked(new Set());
    try {
      const res = await fetch(`/admin/customers/${customerId}/previous-items`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setLastOrder(data.lastOrder ?? null);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? items.filter((i) => `${i.name} ${i.brand} ${i.sku} ${i.description}`.toLowerCase().includes(n)) : items;
  }, [items, q]);

  const toggle = (key: string) =>
    setPicked((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const addSelected = () => {
    const lines: InvoiceLineInput[] = items
      .filter((i) => picked.has(i.description))
      .map((i) => ({ description: i.name || i.description, quantity: i.lastQty || 1, unitPriceCents: i.lastPriceCents ?? 0 }));
    if (lines.length) onAdd(lines);
    setOpen(false);
  };

  const repeatLast = () => {
    if (lastOrder?.lines.length) onAdd(lastOrder.lines);
    setOpen(false);
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(load)
      ) : (
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50"
        >
          <History className="h-4 w-4" /> Previous items
        </button>
      )}
      {note && !renderTrigger ? <p className="mt-1 text-right text-xs text-amber-700">{note}</p> : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setOpen(false)}>
          <div className="mt-2 w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 font-display text-lg text-olive-900"><History className="h-5 w-5 text-olive-700" /> Previous items</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="relative flex-1 min-w-[12rem]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" className="h-9 w-full rounded-lg border border-olive-200 pl-9 pr-3 text-sm focus:border-olive-500 focus:outline-none" />
              </div>
              {lastOrder?.lines.length ? (
                <button type="button" onClick={repeatLast} className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50">
                  <RotateCcw className="h-4 w-4" /> Repeat last order ({lastOrder.number})
                </button>
              ) : null}
            </div>

            <div className="max-h-[60vh] overflow-auto px-4 pb-3">
              {loading ? (
                <p className="py-8 text-center text-sm text-olive-500">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-olive-500">{items.length === 0 ? "No past orders for this customer yet." : "No items match."}</p>
              ) : (
                <ul className="divide-y divide-olive-50">
                  {filtered.map((i) => {
                    const sel = picked.has(i.description);
                    return (
                      <li key={i.description}>
                        <label className={`flex cursor-pointer items-center gap-3 py-2 ${!i.inCatalog ? "opacity-50" : ""}`}>
                          <input type="checkbox" checked={sel} onChange={() => toggle(i.description)} className="h-4 w-4 accent-olive-800" />
                          {i.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={i.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-md border border-olive-100 object-cover" />
                          ) : (
                            <div className="h-11 w-11 shrink-0 rounded-md border border-dashed border-olive-200" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-olive-900">{i.name}{!i.inCatalog ? <span className="ml-1 text-xs text-olive-400">(not in catalog)</span> : null}</p>
                            <p className="truncate text-xs text-olive-500">{[i.brand, i.sku ? `SKU ${i.sku}` : ""].filter(Boolean).join(" · ")}</p>
                          </div>
                          <div className="shrink-0 text-right text-xs text-olive-600">
                            <p>last: {i.lastQty} × {money(i.lastPriceCents)}</p>
                            <p className="text-olive-400">{i.lastOrderLabel} · ×{i.timesOrdered}</p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-olive-100 px-4 py-3">
              <span className="text-xs text-olive-500">{picked.size} selected</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-olive-200 px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">Cancel</button>
                <button type="button" onClick={addSelected} disabled={picked.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50">
                  <Check className="h-4 w-4" /> Add to invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
