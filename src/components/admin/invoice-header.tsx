"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Pencil, UserPlus } from "lucide-react";

import { CustomerSearchBar, type CustomerSearchOption } from "@/components/admin/customer-search-bar";
import { SALES_REPS, TERMS_OPTIONS, termsDueDays } from "@/lib/invoice-constants";

// The id of the InvoiceEditForm <form>. Detail inputs here live outside that
// form in the DOM but submit with it via the HTML `form` attribute.
export const SAVE_FORM_ID = "invoice-save-form";

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const fieldCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";

export function InvoiceHeader({
  invoiceId,
  current,
  customers,
  number,
  terms: terms0,
  issueDate: issueDate0,
  salesRep: salesRep0,
  defaultSalesRep,
  statusLabel,
  statusBadge,
}: {
  invoiceId: string;
  current: { id: string; label: string } | null;
  customers: CustomerSearchOption[];
  number: string;
  terms: string;
  issueDate: string;
  salesRep: string;
  defaultSalesRep: string;
  statusLabel: string;
  statusBadge: string;
}) {
  const [open, setOpen] = useState(!current);
  const [terms, setTerms] = useState(terms0 || "Due on receipt");
  const [issueDate, setIssueDate] = useState(issueDate0);
  const [salesRep, setSalesRep] = useState(salesRep0 || defaultSalesRep || "");

  const dueDate = useMemo(() => {
    const days = termsDueDays(terms);
    return days != null && issueDate ? addDays(issueDate, days) : issueDate || "";
  }, [terms, issueDate]);

  return (
    <div className="rounded-xl border border-olive-100 bg-white">
      {/* Collapsed row — tap anywhere to edit */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-display text-xl text-olive-900">{current.label}</span>
                <span className="text-sm text-olive-400">{number}</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}>{statusLabel}</span>
              </div>
              <p className="mt-0.5 truncate text-sm text-olive-500">
                Issued {shortDate(issueDate)} · {terms}{salesRep ? ` · ${salesRep}` : ""}
              </p>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 font-display text-lg text-olive-700">
              <UserPlus className="h-5 w-5 text-olive-500" /> Add a customer
            </span>
          )}
        </div>
        {current ? (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-olive-500">
            <Pencil className="h-3.5 w-3.5" />
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        ) : (
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-olive-400 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open ? (
        <div className="space-y-4 border-t border-olive-100 p-4">
          {/* Customer (its own POST — must stay outside the save form) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-olive-500">Customer</label>
            <CustomerSearchBar invoiceId={invoiceId} current={current} customers={customers} />
          </div>

          {/* Invoice details — submit with the save form via form={SAVE_FORM_ID} */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-olive-500">Invoice number</label>
              <input form={SAVE_FORM_ID} name="number" defaultValue={number} className={`${fieldCls} font-medium`} placeholder="LV-0001" />
            </div>
            <div>
              <label className="text-xs text-olive-500">Terms</label>
              <select form={SAVE_FORM_ID} name="terms" value={terms} onChange={(e) => setTerms(e.target.value)} className={fieldCls}>
                {TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-olive-500">Issue date</label>
              <input form={SAVE_FORM_ID} type="date" name="issueDate" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className="text-xs text-olive-500">Sales rep</label>
              <input form={SAVE_FORM_ID} name="salesRep" list="sales-reps" value={salesRep} onChange={(e) => setSalesRep(e.target.value)} placeholder="Team member" className={fieldCls} />
              <datalist id="sales-reps">
                {SALES_REPS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div className="flex items-end">
              <p className="inline-flex items-center gap-1.5 text-xs text-olive-500">
                <CalendarDays className="h-3.5 w-3.5" /> Due {dueDate ? shortDate(dueDate) : "—"}
              </p>
            </div>
          </div>
          {/* dueDate is derived; submit it hidden with the save form. */}
          <input form={SAVE_FORM_ID} type="hidden" name="dueDate" value={dueDate} />

          {current ? (
            <div className="flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-olive-200 px-4 py-1.5 text-sm font-medium text-olive-700 hover:bg-olive-50">Done</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
