"use client";

import { useState } from "react";
import { PenLine, X } from "lucide-react";

import { SignatureForm } from "@/components/invoice/signature-pad";

/**
 * A "Review & sign" button that opens the invoice PDF in a viewer with a
 * signature line, then captures the signature. Submitting embeds it onto the
 * PDF's signature line (server-side) and marks the invoice accepted.
 */
export function SignInvoice({
  pdfUrl,
  action,
  defaultName = "",
}: {
  pdfUrl: string;
  action: string;
  defaultName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-olive-900 px-5 py-3 text-sm font-medium text-white hover:bg-olive-800 sm:w-auto"
      >
        <PenLine className="h-4 w-4" /> Review &amp; sign
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-5 py-3">
              <h3 className="font-display text-lg text-olive-900">Review &amp; sign</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="mb-1.5 text-xs text-olive-500">Scroll the invoice to the signature line, then sign below.</p>
                <iframe src={pdfUrl} title="Invoice PDF" className="h-80 w-full rounded-lg border border-olive-200 bg-olive-50/40" />
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-olive-600 underline">
                  Can&apos;t see the PDF? Open it in a new tab
                </a>
              </div>
              <SignatureForm action={action} defaultName={defaultName} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
