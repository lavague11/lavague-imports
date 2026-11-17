"use client";

import { useState } from "react";
import { UserPlus, X, Check, Upload } from "lucide-react";

import { AddressFields } from "@/components/admin/address-fields";

const inputCls = "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-olive-600";
const ACTION = "/admin/customers/create";

export function AddCustomer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"form" | "vcf">("form");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800"
      >
        <UserPlus className="h-4 w-4" /> Add customer
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setOpen(false)}>
          <div className="mt-4 w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h2 className="font-display text-lg text-olive-900">Add a customer</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-1.5 px-4 pt-3">
              {(["form", "vcf"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-full border px-3 py-1 text-xs ${tab === t ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
                >
                  {t === "form" ? "Enter details" : "Upload .vcf"}
                </button>
              ))}
            </div>

            {tab === "form" ? (
              <form method="post" action={ACTION} encType="multipart/form-data" className="px-4 py-3">
                <div>
                  <label className={labelCls}>Business name</label>
                  <input name="businessName" autoFocus placeholder="Start typing the business…" className={inputCls} />
                  <p className="mt-1 text-xs text-olive-400">Then the address below — Google-assisted when a Maps key is set.</p>
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

                <div className="mt-3">
                  <label className={labelCls}>Notes</label>
                  <input name="notes" placeholder="Optional admin note" className={inputCls} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs text-olive-400">Saved as a wholesale customer.</p>
                  <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
                    <Check className="h-4 w-4" /> Create customer
                  </button>
                </div>
              </form>
            ) : (
              <form method="post" action={ACTION} encType="multipart/form-data" className="px-4 py-4">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-olive-200 bg-olive-50/40 px-4 py-8 text-center hover:border-olive-400">
                  <Upload className="h-6 w-6 text-olive-400" />
                  <span className="text-sm font-medium text-olive-800">Choose a .vcf file</span>
                  <span className="text-xs text-olive-500">Contact cards (one or many) — business, name, phone, email and address are imported.</span>
                  <input type="file" name="vcf" accept=".vcf,text/vcard" required className="mt-1 block w-full text-xs text-olive-600 file:mr-3 file:rounded-lg file:border-0 file:bg-olive-900 file:px-3 file:py-1.5 file:text-white" />
                </label>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs text-olive-400">Imported as wholesale customers. Contacts with no email get a placeholder you can fix.</p>
                  <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
                    <Upload className="h-4 w-4" /> Import
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
