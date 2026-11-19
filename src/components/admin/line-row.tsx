"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Image as ImageIcon, Info, Trash2, Undo2 } from "lucide-react";

import { dollarsToCents } from "@/lib/invoice-constants";

interface LineInfo {
  lastPriceCents: number | null;
  lastDate: string | null;
  catalogPriceCents: number | null;
  imageUrl: string | null;
  history: { priceCents: number; date: string }[];
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

// One debounced lookup per line: the customer's last-paid price + the catalog
// photo. Also auto-fills an empty price the first time an item is recognised.
function useLineLookup(customerId: string | null, name: string, isCredit: boolean | undefined, price: string, onAutoFill: (v: string) => void) {
  const [info, setInfo] = useState<LineInfo | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const lastNameRef = useRef("");

  useEffect(() => {
    const n = name.trim();
    if (isCredit || n.length < 3) { setInfo(null); setBase(null); setImageUrl(null); return; }
    const t = setTimeout(async () => {
      try {
        const u = new URL("/admin/invoices/price-history", window.location.origin);
        if (customerId) u.searchParams.set("customerId", customerId);
        u.searchParams.set("name", n);
        const d: LineInfo = await (await fetch(u.toString())).json();
        setImageUrl(d.imageUrl ?? null);
        const b = d.lastPriceCents ?? d.catalogPriceCents;
        if (b == null) { setInfo(null); setBase(null); return; }
        setInfo(d);
        setBase(b);
        if (!price.trim() && lastNameRef.current !== n) onAutoFill((b / 100).toFixed(2));
        lastNameRef.current = n;
      } catch {
        /* ignore */
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, customerId, isCredit]);

  return { info, base, imageUrl };
}

export interface LineRowProps {
  index: number;
  description: string;
  qty: string;
  unit: string;
  isCredit?: boolean;
  creditReason?: string;
  customerId: string | null;
  onChange: (patch: { description?: string; qty?: string; unit?: string }) => void;
  onRemove: () => void;
}

const inputCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";

export function LineRow(props: LineRowProps) {
  const { description, qty, unit, isCredit } = props;
  const { info, base, imageUrl } = useLineLookup(props.customerId, description, isCredit, unit, (v) => props.onChange({ unit: v }));
  // A blank new line opens straight into edit mode; filled lines render compact.
  const [editing, setEditing] = useState(!description.trim());
  const [open, setOpen] = useState(false); // price-history popover
  const [dx, setDx] = useState(0); // swipe-to-delete offset
  const touchX = useRef<number | null>(null);

  const amountCents = Math.max(0, Math.round(Number(qty) || 0)) * dollarsToCents(unit);
  const cur = Math.round((parseFloat(unit) || 0) * 100);
  const entered = unit.trim().length > 0;
  const diff = base != null ? cur - base : 0;
  const pct = base ? Math.abs(diff) / base : 0;
  const changed = entered && base != null && diff !== 0;
  const infoColor = changed ? (pct > 0.3 ? "text-red-500" : "text-amber-500") : "text-olive-300";
  const hasInfo = !isCredit && info && base != null;

  // Always-present inputs so parseLines keeps its columns aligned. When collapsed
  // they are hidden mirrors; when editing they are the live inputs below.
  const hiddenMirrors = !editing ? (
    <>
      <input type="hidden" name="desc" value={description} />
      <input type="hidden" name="qty" value={qty} />
      <input type="hidden" name="unit" value={unit} />
    </>
  ) : null;
  const creditInputs = (
    <>
      <input type="hidden" name="isCredit" value={isCredit ? "1" : "0"} />
      <input type="hidden" name="creditReason" value={props.creditReason ?? ""} />
    </>
  );

  // ---- Compact display row (tap to edit, swipe left to delete) ----
  if (!editing) {
    return (
      <div className="relative overflow-hidden border-b border-olive-50 last:border-0">
        {/* Delete affordance revealed on swipe */}
        <div className="absolute inset-y-0 right-0 flex items-center bg-red-500 px-4 text-white">
          <Trash2 className="h-5 w-5" />
        </div>
        <div
          style={{ transform: `translateX(${dx}px)` }}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchMove={(e) => {
            if (touchX.current == null) return;
            const d = e.touches[0].clientX - touchX.current;
            if (d < 0) setDx(Math.max(d, -96));
          }}
          onTouchEnd={() => {
            if (dx < -64) props.onRemove();
            setDx(0);
            touchX.current = null;
          }}
          className={`relative flex items-center gap-3 bg-white px-4 py-3 transition-[transform] ${isCredit ? "bg-amber-50/40" : ""}`}
        >
          <button type="button" onClick={() => setEditing(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {isCredit ? (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600"><Undo2 className="h-4 w-4" /></div>
            ) : imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-md border border-olive-100 object-cover" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-olive-200 text-olive-300"><ImageIcon className="h-4 w-4" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-olive-900">{description || "Untitled item"}</p>
              <p className="truncate text-xs text-olive-500">
                {qty || "0"} × {entered ? money(cur) : "—"}
                {isCredit ? <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Credit{props.creditReason ? ` · ${props.creditReason}` : ""}</span> : null}
              </p>
            </div>
            <span className={`shrink-0 text-sm font-semibold ${isCredit ? "text-amber-700" : "text-olive-900"}`}>{isCredit ? `−${money(amountCents)}` : money(amountCents)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-olive-300" />
          </button>
        </div>
        {hiddenMirrors}
        {creditInputs}
      </div>
    );
  }

  // ---- Edit mode ----
  return (
    <div className={`invoice-line border-b border-olive-50 px-4 py-4 last:border-0 ${isCredit ? "bg-amber-50/40" : ""}`}>
      <div className="invoice-line-head">
        {isCredit ? (
          <div className="il-thumb flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600"><Undo2 className="h-4 w-4" /></div>
        ) : imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="il-thumb h-10 w-10 shrink-0 rounded-md border border-olive-100 object-cover" />
        ) : (
          <div className="il-thumb flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-olive-200 text-olive-300"><ImageIcon className="h-4 w-4" /></div>
        )}
        <div className="il-name min-w-0 flex-1">
          <input name="desc" value={description} onChange={(e) => props.onChange({ description: e.target.value })} placeholder="Item or service" autoFocus={!description} className={inputCls} />
          {isCredit ? <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Credit{props.creditReason ? ` · ${props.creditReason}` : ""}</span> : null}
        </div>
        <button type="button" onClick={props.onRemove} aria-label="Remove line" className="il-remove -mr-1 flex h-10 w-9 shrink-0 items-center justify-center text-olive-400 hover:text-red-600">
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div className="il-qty">
        <label className="il-label">Qty</label>
        <input name="qty" inputMode="numeric" value={qty} onChange={(e) => props.onChange({ qty: e.target.value })} placeholder="Qty" className={`${inputCls} text-center`} />
      </div>

      <div className="il-price">
        <label className="il-label">Unit price</label>
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-olive-400">$</span>
            <input name="unit" inputMode="decimal" value={unit} onChange={(e) => props.onChange({ unit: e.target.value })} placeholder="0.00" className={`${inputCls} pl-6 text-right`} />
          </div>
          {hasInfo ? (
            <div className="relative shrink-0">
              <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Price history" className={`flex h-7 w-7 items-center justify-center rounded-full hover:bg-olive-100 ${infoColor}`}>
                <Info className="h-4 w-4" />
              </button>
              {open ? (
                <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-olive-100 bg-white p-2.5 text-left shadow-lg" onMouseLeave={() => setOpen(false)}>
                  {info!.lastPriceCents != null ? (
                    <p className="text-sm font-medium text-olive-900">Last paid {money(info!.lastPriceCents)}{info!.lastDate ? <span className="font-normal text-olive-400"> · {info!.lastDate}</span> : null}</p>
                  ) : (
                    <p className="text-sm font-medium text-olive-900">Catalog {info!.catalogPriceCents != null ? money(info!.catalogPriceCents) : "—"}</p>
                  )}
                  {changed ? <p className={`text-xs ${pct > 0.3 ? "text-red-600" : "text-amber-600"}`}>Now {diff > 0 ? "+" : "−"}{money(Math.abs(diff))} vs last</p> : null}
                  {info!.history.length > 1 ? (
                    <>
                      <p className="mb-0.5 mt-2 text-[10px] font-medium uppercase tracking-wide text-olive-400">Last {info!.history.length}</p>
                      <ul className="space-y-0.5 text-xs text-olive-700">
                        {info!.history.map((h, k) => (
                          <li key={k} className="flex justify-between"><span>{money(h.priceCents)}</span><span className="text-olive-400">{h.date}</span></li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="il-total">
        <span className="il-total-text">Line total</span>
        <span className={`font-semibold ${isCredit ? "text-amber-700" : "text-olive-900"}`}>{isCredit ? `−${money(amountCents)}` : money(amountCents)}</span>
      </div>

      {/* Done collapses the row to its compact form (only when it has a name). */}
      <div className="il-done mt-1 flex justify-end" style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          onClick={() => { if (description.trim()) setEditing(false); else props.onRemove(); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-olive-100 px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-200"
        >
          <Check className="h-4 w-4" /> Done
        </button>
      </div>

      {creditInputs}
    </div>
  );
}
