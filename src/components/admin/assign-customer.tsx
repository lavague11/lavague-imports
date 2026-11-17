"use client";

import { useMemo, useState } from "react";
import { UserPlus, X, Search, Check } from "lucide-react";

import { AddressFields } from "@/components/admin/address-fields";

export interface CustomerOption {
  id: string;
  label: string; // business name / name / email
  sub: string; // email or secondary line
}

interface Props {
  invoiceId: string;
  current: { id: string; label: string } | null;
  customers: CustomerOption[];
}

const inputCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-olive-600";

export function AssignCustomer({ invoiceId, current, customers }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"existing" | "new">(current ? "existing" : "existing");
  const action = `/admin/invoices/${invoiceId}/customer`;

  return (
    <div className="text-right">
      {current ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-olive-500">For</span>
          <span className="font-medium text-olive-800">{current.label}</span>
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-olive-500 underline hover:text-olive-800">
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50"
        >
          <UserPlus className="h-4 w-4" /> Add customer
        </button>
      )}

      {open ? (
        <Modal onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
            <h2 className="font-display text-lg text-olive-900">{current ? "Change customer" : "Add a customer"}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex gap-1.5 px-4 pt-3">
            {(["existing", "new"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full border px-3 py-1 text-xs ${tab === t ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
              >
                {t === "existing" ? "Pick existing" : "New customer"}
              </button>
            ))}
          </div>

          {tab === "existing" ? (
            <ExistingPicker action={action} customers={customers} />
          ) : (
            <NewCustomer action={action} />
          )}

          {current ? (
            <form method="post" action={action} className="border-t border-olive-100 px-4 py-3 text-left">
              <input type="hidden" name="mode" value="unassign" />
              <button className="text-xs text-red-600 underline hover:text-red-700">Remove customer (keep as blank draft)</button>
            </form>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

function ExistingPicker({ action, customers }: { action: string; customers: CustomerOption[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = n ? customers.filter((c) => `${c.label} ${c.sub}`.toLowerCase().includes(n)) : customers;
    return base.slice(0, 50);
  }, [q, customers]);

  return (
    <form method="post" action={action} className="px-4 py-3 text-left">
      <input type="hidden" name="mode" value="existing" />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className={`${inputCls} pl-9`} />
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-olive-100">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-olive-400">No customers match.</p>
        ) : (
          filtered.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-olive-50 px-3 py-2 last:border-0 hover:bg-olive-50">
              <input type="radio" name="customerId" value={c.id} className="h-4 w-4 accent-olive-800" required />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-olive-900">{c.label}</span>
                {c.sub ? <span className="block truncate text-xs text-olive-500">{c.sub}</span> : null}
              </span>
            </label>
          ))
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
          <Check className="h-4 w-4" /> Assign customer
        </button>
      </div>
    </form>
  );
}

function NewCustomer({ action }: { action: string }) {
  return (
    <form method="post" action={action} className="px-4 py-3 text-left">
      <input type="hidden" name="mode" value="new" />
      <div>
        <label className={labelCls}>Business name</label>
        <input name="businessName" autoFocus placeholder="Start typing the business…" className={inputCls} />
        <p className="mt-1 text-xs text-olive-400">Start with the business, then its address below (Google-assisted when a Maps key is set).</p>
      </div>

      <div className="mt-3">
        <AddressFields initial={{}} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Contact name</label>
          <input name="name" placeholder="Optional" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input name="email" type="email" placeholder="Optional" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input name="phone" placeholder="Optional" className={inputCls} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-olive-400">Saved as a wholesale customer. No email? We&apos;ll keep a placeholder you can fix later.</p>
        <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
          <Check className="h-4 w-4" /> Create &amp; assign
        </button>
      </div>
    </form>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="mt-4 w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
