"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";

import { CustomerEditForm, type EditableCustomer } from "@/components/admin/customer-edit-form";

export interface AuditEntry {
  id: string;
  actor: string;
  summary: string;
  when: string;
}

export function CustomerEditDrawer({
  customer,
  audits,
}: {
  customer: EditableCustomer;
  audits: AuditEntry[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-olive-300 px-3 text-sm font-medium text-olive-800 hover:bg-olive-50"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-olive-50 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-olive-100 bg-white px-5 py-3">
              <h2 className="font-display text-lg text-olive-900">Edit customer</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-olive-500 hover:bg-olive-50 hover:text-olive-900"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              <CustomerEditForm customer={customer} />

              <section className="mt-6">
                <h3 className="text-sm font-semibold text-olive-900">Change history</h3>
                {audits.length === 0 ? (
                  <p className="mt-2 text-sm text-olive-500">No changes recorded yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {audits.map((a) => (
                      <li key={a.id} className="rounded-lg border border-olive-100 bg-white px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-olive-500">
                          <span>{a.actor}</span>
                          <span>{a.when}</span>
                        </div>
                        <p className="mt-1 text-olive-700">{a.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
