"use client";

import { useState } from "react";
import { Check, Undo2, X } from "lucide-react";

import { CREDIT_REASONS } from "@/lib/invoice-constants";

interface PrevItem {
  description: string;
  name: string;
  lastPriceCents: number | null;
  lastQty: number;
}

export interface CreditInput {
  description: string;
  quantity: number;
  amountCentsEach: number;
  reason: string;
}

const inputCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";
const money = (c: number | null) => (c != null ? `$${(c / 100).toFixed(2)}` : "—");

export function AddCredit({ customerId, onAdd }: { customerId: string | null; onAdd: (c: CreditInput) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [mode, setMode] = useState<"amount" | "product">("amount");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState<PrevItem[]>([]);
  const [productKey, setProductKey] = useState("");
  const [qty, setQty] = useState("1");

  const openModal = async () => {
    setOpen(true);
    setReason("");
    setOtherNote("");
    setMode("amount");
    setAmount("");
    setProductKey("");
    setQty("1");
    if (customerId) {
      try {
        const d = await (await fetch(`/admin/customers/${customerId}/previous-items`)).json();
        setItems(Array.isArray(d.items) ? d.items : []);
      } catch {
        setItems([]);
      }
    } else setItems([]);
  };

  const selected = items.find((i) => i.description === productKey) || null;
  const canSubmit =
    Boolean(reason) &&
    (mode === "amount" ? parseFloat(amount) > 0 : Boolean(selected && (selected.lastPriceCents ?? 0) > 0));

  const submit = () => {
    const reasonLabel = reason === "Other" && otherNote.trim() ? `Other – ${otherNote.trim()}` : reason;
    if (mode === "amount") {
      onAdd({ description: `Credit – ${reasonLabel}`, quantity: 1, amountCentsEach: Math.round(parseFloat(amount) * 100), reason: reasonLabel });
    } else if (selected) {
      onAdd({
        description: `Credit – ${reasonLabel} – ${selected.name}`,
        quantity: Math.max(1, parseInt(qty, 10) || 1),
        amountCentsEach: selected.lastPriceCents ?? 0,
        reason: reasonLabel,
      });
    }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50"
      >
        <Undo2 className="h-4 w-4" /> Add credit
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setOpen(false)}>
          <div className="mt-2 w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h3 className="font-display text-lg text-olive-900">Add a credit</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3 px-4 py-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-olive-600">Reason <span className="text-red-500">*</span></label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                  <option value="">Choose a reason…</option>
                  {CREDIT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {reason === "Other" ? (
                  <input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder="Describe the reason" className={`${inputCls} mt-2`} />
                ) : null}
              </div>

              <div className="flex gap-1.5">
                {(["amount", "product"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    disabled={m === "product" && items.length === 0}
                    className={`rounded-full border px-3 py-1 text-xs disabled:opacity-40 ${mode === m ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
                  >
                    {m === "amount" ? "Amount ($)" : "From a past item"}
                  </button>
                ))}
              </div>

              {mode === "amount" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-olive-600">Credit amount</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-olive-400">$</span>
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} pl-6`} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-olive-600">Product</label>
                    <select value={productKey} onChange={(e) => setProductKey(e.target.value)} className={inputCls}>
                      <option value="">Choose a past item…</option>
                      {items.filter((i) => (i.lastPriceCents ?? 0) > 0).map((i) => (
                        <option key={i.description} value={i.description}>{i.name} ({money(i.lastPriceCents)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-olive-600">Qty</label>
                    <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={inputCls} />
                  </div>
                </div>
              )}

              {mode === "product" && selected ? (
                <p className="text-xs text-olive-500">Credit total: {money((selected.lastPriceCents ?? 0) * (Math.max(1, parseInt(qty, 10) || 1)))} (last price {money(selected.lastPriceCents)} × {Math.max(1, parseInt(qty, 10) || 1)})</p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-olive-100 px-4 py-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-olive-200 px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">Cancel</button>
              <button type="button" onClick={submit} disabled={!canSubmit} className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50">
                <Check className="h-4 w-4" /> Add credit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
