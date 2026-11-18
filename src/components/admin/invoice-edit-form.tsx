"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { AddCredit, type CreditInput } from "@/components/admin/add-credit";
import { InvoiceAssist, type AssistRow } from "@/components/admin/invoice-assist";
import { NotesDictation } from "@/components/admin/notes-dictation";
import { PhotoToInvoice } from "@/components/admin/photo-to-invoice";
import { PreviousItems, type InvoiceLineInput } from "@/components/admin/previous-items";
import { LineRow } from "@/components/admin/line-row";
import { VoiceOrder, type VoiceItem } from "@/components/admin/voice-order";

import {
  SALES_REPS,
  TERMS_OPTIONS,
  WHOLESALE_MINIMUM_CENTS,
  dollarsToCents,
  termsDueDays,
} from "@/lib/invoice-constants";

export interface EditLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  isCredit?: boolean;
  creditReason?: string | null;
}

export interface InvoiceEditFormProps {
  action: string;
  cancelHref: string;
  invoiceId: string;
  number: string;
  customerId: string | null;
  customerRole: "CUSTOMER" | "WHOLESALE" | null;
  categories: { slug: string; name: string }[];
  issueDate: string; // yyyy-mm-dd
  dueDate: string;
  terms: string;
  salesRep: string;
  notes: string;
  discount: string; // dollars
  shipping: string;
  tax: string;
  lines: EditLine[];
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dollars = (cents: number) => (cents / 100).toFixed(2);
const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

interface Row { description: string; qty: string; unit: string; isCredit?: boolean; creditReason?: string }

export function InvoiceEditForm(props: InvoiceEditFormProps) {
  const [rows, setRows] = useState<Row[]>(
    props.lines.length
      ? props.lines.map((l) => ({ description: l.description, qty: String(l.quantity), unit: dollars(Math.abs(l.unitPriceCents)), isCredit: l.isCredit, creditReason: l.creditReason ?? undefined }))
      : [{ description: "", qty: "1", unit: "" }],
  );
  const [issueDate, setIssueDate] = useState(props.issueDate);
  const [terms, setTerms] = useState(props.terms || "Due on receipt");
  // Due date is derived from terms + issue date and shown read-only.
  const dueDate = useMemo(() => {
    const days = termsDueDays(terms);
    return days != null && issueDate ? addDays(issueDate, days) : issueDate || "";
  }, [terms, issueDate]);
  const [discount, setDiscount] = useState(props.discount);
  const [shipping, setShipping] = useState(props.shipping);
  const [tax, setTax] = useState(props.tax);

  const [undo, setUndo] = useState<{ row: Row; index: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { description: "", qty: "1", unit: "" }]);
  const removeRow = (i: number) => {
    setRows((rs) => {
      if (rs.length <= 1) return [{ description: "", qty: "1", unit: "" }]; // clear the last line instead of deleting
      setUndo({ row: rs[i], index: i });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 10000);
      return rs.filter((_, j) => j !== i);
    });
  };
  const doUndo = () => {
    if (!undo) return;
    setRows((rs) => { const c = [...rs]; c.splice(Math.min(undo.index, c.length), 0, undo.row); return c; });
    setUndo(null);
  };

  // Always keep one blank line open at the bottom.
  useEffect(() => {
    const last = rows[rows.length - 1];
    if (last && (last.description.trim() || last.unit.trim())) {
      setRows((rs) => [...rs, { description: "", qty: "1", unit: "" }]);
    }
  }, [rows]);

  // AI assist: current lines for "Pro clean-up", and applying the reviewed rows.
  const assistLines = () => rows.map((r) => ({ description: r.description, quantity: Math.max(1, parseInt(r.qty, 10) || 1) }));
  const applyAssist = (assistRows: AssistRow[], mode: "cleanup" | "photo") => {
    const mapped: Row[] = assistRows.map((a) => ({
      description: a.name,
      qty: String(a.quantity || 1),
      unit: a.priceCents != null ? (a.priceCents / 100).toFixed(2) : "",
    }));
    if (mode === "cleanup") setRows(mapped.length ? mapped : rows);
    else setRows((prev) => { const keep = prev.filter((r) => r.description.trim() || r.unit.trim()); return [...keep, ...mapped]; });
  };

  // Voice order: add one spoken line at a time (replacing a lone empty starter row).
  const addVoiceLine = (item: VoiceItem) => {
    const isCredit = Boolean(item.isCredit);
    const description = isCredit
      ? `Credit – ${item.creditReason || "Other"}${item.name && item.name !== "Credit" ? ` – ${item.name}` : ""}`
      : item.name;
    const row: Row = {
      description,
      qty: String(item.quantity || 1),
      unit: item.priceCents != null ? (item.priceCents / 100).toFixed(2) : "",
      isCredit,
      creditReason: isCredit ? item.creditReason || "Other" : undefined,
    };
    setRows((prev) => (prev.length === 1 && !prev[0].description.trim() && !prev[0].unit.trim() ? [row] : [...prev, row]));
  };

  // Add one or more lines at once (Previous items / Repeat last order).
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const addLines = (lines: InvoiceLineInput[]) => {
    const mapped: Row[] = lines.map((l) => ({ description: l.description, qty: String(l.quantity || 1), unit: l.unitPriceCents ? (l.unitPriceCents / 100).toFixed(2) : "" }));
    setRows((prev) => {
      const base = prev.length === 1 && !prev[0].description.trim() && !prev[0].unit.trim() ? [] : prev;
      return [...base, ...mapped];
    });
  };

  // Add a credit line (negative) from the Add-credit form.
  const addCredit = (c: CreditInput) => {
    const row: Row = { description: c.description, qty: String(c.quantity || 1), unit: (c.amountCentsEach / 100).toFixed(2), isCredit: true, creditReason: c.reason };
    setRows((prev) => (prev.length === 1 && !prev[0].description.trim() && !prev[0].unit.trim() ? [prev[0], row] : [...prev, row]));
  };

  // Magnitude of a row (positive); credits count against the total.
  const lineTotal = (r: Row) => Math.max(0, Math.round(Number(r.qty) || 0)) * dollarsToCents(r.unit);
  const subtotalCents = useMemo(() => rows.filter((r) => !r.isCredit).reduce((s, r) => s + lineTotal(r), 0), [rows]);
  const creditsCents = useMemo(() => rows.filter((r) => r.isCredit).reduce((s, r) => s + lineTotal(r), 0), [rows]);
  const totalCents =
    Math.max(0, subtotalCents - dollarsToCents(discount) + dollarsToCents(shipping) + dollarsToCents(tax) - creditsCents);

  const belowMinimum = props.customerRole === "WHOLESALE" && subtotalCents > 0 && subtotalCents < WHOLESALE_MINIMUM_CENTS;

  // Block save if any filled line is missing a name or a price.
  const onSubmit = (e: React.FormEvent) => {
    const bad = rows.some((r) => {
      const hasName = r.description.trim().length > 0;
      const hasPrice = r.unit.trim().length > 0;
      return (hasName && !hasPrice) || (hasPrice && !hasName);
    });
    if (bad) {
      e.preventDefault();
      setSaveError("Every line needs both a name and a price — fill them in or remove the line.");
    }
  };

  const inputCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";

  return (
    <form method="post" action={props.action} onSubmit={onSubmit} className="mt-4 space-y-5">
      <div className="rounded-xl border border-olive-100 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-olive-500">Invoice number</label>
            <input name="number" defaultValue={props.number} className={`${inputCls} font-medium`} placeholder="LV-0001" />
            <p className="mt-1 text-xs text-olive-400">Editable — must be unique.</p>
          </div>
          <div>
            <label className="text-xs text-olive-500">Terms</label>
            <select name="terms" value={terms} onChange={(e) => setTerms(e.target.value)} className={inputCls}>
              {TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-olive-500">Due date</label>
            <input type="date" name="dueDate" value={dueDate} readOnly className={`${inputCls} bg-olive-50/60 text-olive-600`} />
            <p className="mt-1 text-xs text-olive-400">Auto-calculated from terms.</p>
          </div>
          <div>
            <label className="text-xs text-olive-500">Issue date</label>
            <input type="date" name="issueDate" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-olive-500">Sales rep</label>
            <input name="salesRep" list="sales-reps" defaultValue={props.salesRep || "Waleed"} placeholder="Team member" className={inputCls} />
            <datalist id="sales-reps">
              {SALES_REPS.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
        </div>
      </div>

      {belowMinimum ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Subtotal {money(subtotalCents)} is below the ${WHOLESALE_MINIMUM_CENTS / 100} wholesale minimum. You can still save, but review before sending.
        </div>
      ) : null}

      {/* Line items */}
      <div className="overflow-hidden rounded-xl border border-olive-100 bg-white">
        <div className="hidden grid-cols-[1fr_5rem_7rem_6rem_2rem] gap-2 border-b border-olive-100 bg-olive-50/60 px-4 py-2 text-xs text-olive-600 sm:grid">
          <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span><span />
        </div>
        {rows.map((r, i) => (
          <LineRow
            key={i}
            index={i}
            description={r.description}
            qty={r.qty}
            unit={r.unit}
            isCredit={r.isCredit}
            creditReason={r.creditReason}
            customerId={props.customerId}
            onChange={(patch) => setRow(i, patch)}
            onRemove={() => removeRow(i)}
          />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-sm font-medium text-olive-700 hover:text-olive-900">
            <Plus className="h-4 w-4" /> Add line
          </button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <VoiceOrder onAddLine={addVoiceLine} customerId={props.customerId} invoiceId={props.invoiceId} />
            <PreviousItems customerId={props.customerId} onAdd={addLines} />
            <AddCredit customerId={props.customerId} onAdd={addCredit} />
            <InvoiceAssist getLines={assistLines} onApply={applyAssist} />
            <PhotoToInvoice customerId={props.customerId} categories={props.categories} onAddLine={(line) => addLines([line])} />
          </div>
        </div>
      </div>

      {/* Adjustments + totals */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-olive-100 bg-white p-4">
          <label className="text-xs text-olive-500">Notes (shown on the invoice)</label>
          <div className="relative mt-1">
            <textarea ref={notesRef} name="notes" defaultValue={props.notes} rows={4} className="w-full rounded-lg border border-olive-200 px-3 py-2 pr-11 text-sm focus:border-olive-500 focus:outline-none" placeholder="Payment instructions, PO details, thanks…" />
            <NotesDictation targetRef={notesRef} />
          </div>
        </div>
        <div className="rounded-xl border border-olive-100 bg-white p-4 text-sm">
          <Row label="Subtotal" value={money(subtotalCents)} />
          <Adjust label="Discount" name="discount" value={discount} onChange={setDiscount} />
          <Adjust label="Delivery" name="shipping" value={shipping} onChange={setShipping} />
          <Adjust label="Tax" name="tax" value={tax} onChange={setTax} />
          {creditsCents > 0 ? (
            <div className="flex items-center justify-between py-1 text-amber-700">
              <span>Credits</span><span>−{money(creditsCents)}</span>
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-olive-100 pt-2 text-base font-semibold text-olive-900">
            <span>Total</span><span>{money(totalCents)}</span>
          </div>
        </div>
      </div>

      {saveError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-right text-sm text-red-700">{saveError}</p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Link href={props.cancelHref} className="rounded-lg border border-olive-200 px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">Cancel</Link>
        <button type="submit" className="rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800">Save invoice</button>
      </div>

      {/* Undo toast after removing a line */}
      {undo ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-olive-900 px-4 py-2 text-sm text-white shadow-lg">
          Line removed
          <button type="button" onClick={doUndo} className="font-semibold text-emerald-300 underline">Undo</button>
        </div>
      ) : null}
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-olive-600">
      <span>{label}</span><span className="text-olive-800">{value}</span>
    </div>
  );
}

function Adjust({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <label className="text-olive-600">{label}</label>
      <div className="relative w-28">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-olive-400">$</span>
        <input name={name} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" className="h-9 w-full rounded-lg border border-olive-200 pl-6 pr-2 text-right text-sm focus:border-olive-500 focus:outline-none" />
      </div>
    </div>
  );
}
