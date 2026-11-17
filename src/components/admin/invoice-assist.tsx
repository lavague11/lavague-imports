"use client";

import { useRef, useState } from "react";
import { Camera, Check, Sparkles, Wand2, X } from "lucide-react";

export interface AssistRow {
  original: string;
  name: string;
  brand: string;
  sku: string;
  quantity: number;
  priceCents: number | null;
  matchTag: "exact" | "likely" | "no match";
}

const TAG: Record<string, { label: string; cls: string }> = {
  exact: { label: "exact match", cls: "bg-emerald-100 text-emerald-700" },
  likely: { label: "likely match", cls: "bg-amber-100 text-amber-800" },
  "no match": { label: "no match", cls: "bg-olive-100 text-olive-600" },
};

const cell = "h-9 w-full rounded-md border border-olive-200 px-2 text-sm focus:border-olive-500 focus:outline-none";

export function InvoiceAssist({
  getLines,
  onApply,
}: {
  getLines: () => { description: string; quantity: number }[];
  onApply: (rows: AssistRow[], mode: "cleanup" | "photo") => void;
}) {
  const [busy, setBusy] = useState<null | "cleanup" | "photo">(null);
  const [mode, setMode] = useState<"cleanup" | "photo">("cleanup");
  const [rows, setRows] = useState<AssistRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const handle = async (m: "cleanup" | "photo", body: FormData) => {
    setBusy(m);
    setNote(null);
    try {
      const res = await fetch("/admin/invoices/assist", { method: "POST", body });
      const data = await res.json();
      if (data.configured === false) setNote("This needs an ANTHROPIC_API_KEY — add it under /developers to turn it on.");
      else if (data.error) setNote("Couldn't complete that — try again.");
      else if (Array.isArray(data.rows) && data.rows.length) {
        setMode(m);
        setRows(data.rows);
      } else setNote("Nothing came back to review.");
    } catch {
      setNote("Couldn't reach the assistant — try again.");
    } finally {
      setBusy(null);
    }
  };

  const runCleanup = () => {
    const lines = getLines().filter((l) => l.description.trim());
    if (lines.length === 0) {
      setNote("Type some line items first, then clean them up.");
      return;
    }
    const fd = new FormData();
    fd.append("mode", "cleanup");
    fd.append("lines", JSON.stringify(lines));
    void handle("cleanup", fd);
  };

  const runPhoto = (files: FileList | null) => {
    const arr = Array.from(files ?? []).slice(0, 4);
    if (arr.length === 0) return;
    const fd = new FormData();
    fd.append("mode", "photo");
    arr.forEach((f) => fd.append("image", f));
    void handle("photo", fd);
  };

  const setRow = (i: number, patch: Partial<AssistRow>) =>
    setRows((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...patch } : r)) : rs));

  const apply = () => {
    if (rows) onApply(rows, mode);
    setRows(null);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runCleanup}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-60"
        >
          <Wand2 className="h-4 w-4" /> {busy === "cleanup" ? "Working…" : "Pro clean-up"}
        </button>
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-60"
        >
          <Camera className="h-4 w-4" /> {busy === "photo" ? "Reading…" : "From photo"}
        </button>
        <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { runPhoto(e.target.files); e.target.value = ""; }} />
      </div>
      {note ? <p className="mt-1 text-right text-xs text-olive-500">{note}</p> : null}

      {rows ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setRows(null)}>
          <div className="mt-2 w-full max-w-3xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 font-display text-lg text-olive-900">
                <Sparkles className="h-5 w-5 text-olive-700" /> Review {mode === "photo" ? "identified items" : "clean-up"}
              </h3>
              <button type="button" onClick={() => setRows(null)} aria-label="Close" className="text-olive-400 hover:text-olive-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-auto px-4 py-3">
              <p className="mb-2 text-xs text-olive-500">Nothing changes on the invoice until you Apply. Edit anything below first.</p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-olive-500">
                  <tr>
                    <th className="p-2">Original</th>
                    <th className="p-2">Matched product</th>
                    <th className="p-2">Brand</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2 w-16">Qty</th>
                    <th className="p-2 w-24">Price</th>
                    <th className="p-2">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-olive-50 align-top">
                      <td className="p-2 text-olive-500">{r.original || "—"}</td>
                      <td className="p-2"><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} className={cell} /></td>
                      <td className="p-2 text-olive-600">{r.brand || "—"}</td>
                      <td className="p-2 text-olive-600">{r.sku || "—"}</td>
                      <td className="p-2">
                        <input value={String(r.quantity)} inputMode="numeric" onChange={(e) => setRow(i, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={`${cell} text-right`} />
                      </td>
                      <td className="p-2">
                        <input
                          value={r.priceCents != null ? (r.priceCents / 100).toFixed(2) : ""}
                          inputMode="decimal"
                          placeholder="—"
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setRow(i, { priceCents: v ? Math.round(parseFloat(v) * 100) : null });
                          }}
                          className={`${cell} text-right`}
                        />
                      </td>
                      <td className="p-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TAG[r.matchTag]?.cls ?? TAG["no match"].cls}`}>
                          {TAG[r.matchTag]?.label ?? r.matchTag}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-olive-100 px-4 py-3">
              <span className="text-xs text-olive-500">
                {mode === "photo" ? "These will be added as new lines." : "These will replace the typed lines."}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRows(null)} className="rounded-lg border border-olive-200 px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">Cancel</button>
                <button type="button" onClick={apply} className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800">
                  <Check className="h-4 w-4" /> Apply to invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
