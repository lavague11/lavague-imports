"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  INVOICE_TERMS,
  WHOLESALE_MINIMUM_CENTS,
  dollarsToCents,
  termsDueDays,
} from "@/lib/invoice-constants";

export interface EditLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface InvoiceEditFormProps {
  action: string;
  cancelHref: string;
  number: string;
  customerRole: "CUSTOMER" | "WHOLESALE" | null;
  issueDate: string; // yyyy-mm-dd
  dueDate: string;
  terms: string;
  poNumber: string;
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

interface Row { description: string; qty: string; unit: string }

export function InvoiceEditForm(props: InvoiceEditFormProps) {
  const [rows, setRows] = useState<Row[]>(
    props.lines.length
      ? props.lines.map((l) => ({ description: l.description, qty: String(l.quantity), unit: dollars(l.unitPriceCents) }))
      : [{ description: "", qty: "1", unit: "" }],
  );
  const [issueDate, setIssueDate] = useState(props.issueDate);
  const [dueDate, setDueDate] = useState(props.dueDate);
  const [terms, setTerms] = useState(props.terms);
  const [discount, setDiscount] = useState(props.discount);
  const [shipping, setShipping] = useState(props.shipping);
  const [tax, setTax] = useState(props.tax);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { description: "", qty: "1", unit: "" }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const lineTotal = (r: Row) => Math.max(0, Math.round(Number(r.qty) || 0)) * dollarsToCents(r.unit);
  const subtotalCents = useMemo(() => rows.reduce((s, r) => s + lineTotal(r), 0), [rows]);
  const totalCents =
    Math.max(0, subtotalCents - dollarsToCents(discount) + dollarsToCents(shipping) + dollarsToCents(tax));

  const belowMinimum = props.customerRole === "WHOLESALE" && subtotalCents > 0 && subtotalCents < WHOLESALE_MINIMUM_CENTS;

  const onTermsChange = (v: string) => {
    setTerms(v);
    const days = termsDueDays(v);
    if (days != null && issueDate) setDueDate(addDays(issueDate, days));
  };

  const inputCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";

  return (
    <form method="post" action={props.action} className="mt-4 space-y-5">
      <div className="rounded-xl border border-olive-100 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-olive-500">Invoice number</label>
            <input name="number" defaultValue={props.number} className={`${inputCls} font-medium`} placeholder="LV-0001" />
            <p className="mt-1 text-xs text-olive-400">Editable — must be unique.</p>
          </div>
          <div>
            <label className="text-xs text-olive-500">Issue date</label>
            <input type="date" name="issueDate" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-olive-500">Due date</label>
            <input type="date" name="dueDate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-olive-500">Terms</label>
            <input name="terms" list="invoice-terms" value={terms} onChange={(e) => onTermsChange(e.target.value)} placeholder="e.g. Net 30" className={inputCls} />
            <datalist id="invoice-terms">
              {INVOICE_TERMS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-olive-500">PO number</label>
            <input name="poNumber" defaultValue={props.poNumber} placeholder="Optional" className={inputCls} />
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
          <div key={i} className="grid grid-cols-1 gap-2 border-b border-olive-50 px-4 py-3 last:border-0 sm:grid-cols-[1fr_5rem_7rem_6rem_2rem] sm:items-center">
            <input name="desc" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Item or service" className={inputCls} />
            <input name="qty" inputMode="numeric" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} placeholder="Qty" className={`${inputCls} sm:text-right`} />
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-olive-400">$</span>
              <input name="unit" inputMode="decimal" value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder="0.00" className={`${inputCls} pl-6 sm:text-right`} />
            </div>
            <div className="text-sm text-olive-800 sm:text-right">{money(lineTotal(r))}</div>
            <button type="button" onClick={() => removeRow(i)} aria-label="Remove line" className="justify-self-start text-olive-400 hover:text-red-600 sm:justify-self-center">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="px-4 py-3">
          <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-sm font-medium text-olive-700 hover:text-olive-900">
            <Plus className="h-4 w-4" /> Add line
          </button>
        </div>
      </div>

      {/* Adjustments + totals */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-olive-100 bg-white p-4">
          <label className="text-xs text-olive-500">Notes (shown on the invoice)</label>
          <textarea name="notes" defaultValue={props.notes} rows={4} className="mt-1 w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none" placeholder="Payment instructions, PO details, thanks…" />
        </div>
        <div className="rounded-xl border border-olive-100 bg-white p-4 text-sm">
          <Row label="Subtotal" value={money(subtotalCents)} />
          <Adjust label="Discount" name="discount" value={discount} onChange={setDiscount} />
          <Adjust label="Delivery" name="shipping" value={shipping} onChange={setShipping} />
          <Adjust label="Tax" name="tax" value={tax} onChange={setTax} />
          <div className="mt-2 flex items-center justify-between border-t border-olive-100 pt-2 text-base font-semibold text-olive-900">
            <span>Total</span><span>{money(totalCents)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link href={props.cancelHref} className="rounded-lg border border-olive-200 px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">Cancel</Link>
        <button type="submit" className="rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800">Save invoice</button>
      </div>
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
