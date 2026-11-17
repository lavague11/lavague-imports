"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Search, UserCheck, X } from "lucide-react";

export interface CustomerSearchOption {
  id: string;
  label: string;
  sub: string;
  phone: string;
}

const inputCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";

export function CustomerSearchBar({
  invoiceId,
  current,
  customers,
}: {
  invoiceId: string;
  current: { id: string; label: string } | null;
  customers: CustomerSearchOption[];
}) {
  const action = `/admin/invoices/${invoiceId}/customer`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(!current);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitRef = useRef<HTMLFormElement>(null);
  const pickedId = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return customers.slice(0, 8);
    return customers.filter((c) => `${c.label} ${c.sub} ${c.phone}`.toLowerCase().includes(n)).slice(0, 8);
  }, [q, customers]);

  const pick = (id: string) => {
    if (pickedId.current && submitRef.current) {
      pickedId.current.value = id;
      submitRef.current.requestSubmit();
    }
  };

  // Already assigned and not editing → compact display with "Change".
  if (current && !editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-olive-100 bg-olive-50/40 px-3 py-2">
        <UserCheck className="h-4 w-4 text-olive-600" />
        <span className="text-sm font-medium text-olive-900">{current.label}</span>
        <button type="button" onClick={() => { setEditing(true); setOpen(true); }} className="ml-auto text-xs text-olive-500 underline hover:text-olive-800">Change</button>
      </div>
    );
  }

  return (
    <div>
      {/* Hidden form that assigns the chosen existing customer (full-page POST). */}
      <form ref={submitRef} method="post" action={action} className="hidden">
        <input type="hidden" name="mode" value="existing" />
        <input ref={pickedId} type="hidden" name="customerId" value="" />
      </form>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          placeholder="Search customers by name, phone, email…"
          className={`${inputCls} pl-9`}
        />
        {current ? (
          <button type="button" onClick={() => setEditing(false)} aria-label="Keep current" className="absolute right-2 top-1/2 -translate-y-1/2 text-olive-400 hover:text-olive-700"><X className="h-4 w-4" /></button>
        ) : null}

        {open ? (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-olive-100 bg-white shadow-lg">
            {matches.map((c) => (
              <li key={c.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-olive-50">
                  <span className="min-w-0"><span className="block truncate font-medium text-olive-900">{c.label}</span>{c.sub || c.phone ? <span className="block truncate text-xs text-olive-500">{[c.sub, c.phone].filter(Boolean).join(" · ")}</span> : null}</span>
                </button>
              </li>
            ))}
            <li className="border-t border-olive-100">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setAdding(true); setOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-olive-800 hover:bg-olive-50">
                <Plus className="h-4 w-4" /> Add new customer{q.trim() ? ` “${q.trim()}”` : ""}
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      {/* Inline new-customer form */}
      {adding ? (
        <form method="post" action={action} className="mt-2 rounded-lg border border-olive-200 bg-white p-3">
          <input type="hidden" name="mode" value="new" />
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="businessName" defaultValue={q.trim()} placeholder="Business name" className={inputCls} />
            <input name="name" placeholder="Contact name" className={inputCls} />
            <input name="phone" placeholder="Phone" className={inputCls} />
            <input name="email" type="email" placeholder="Email (optional)" className={inputCls} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-olive-200 px-3 py-1.5 text-sm text-olive-700 hover:bg-olive-50">Cancel</button>
            <button className="rounded-lg bg-olive-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-olive-800">Add &amp; assign</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
