"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, History, Plus, Save, Send, StickyNote, Undo2, Wand2, X } from "lucide-react";

import { AddCredit, type CreditInput } from "@/components/admin/add-credit";
import { InvoiceAssist, type AssistRow } from "@/components/admin/invoice-assist";
import { MoreMenu, menuRowCls } from "@/components/admin/more-menu";
import { NotesDictation } from "@/components/admin/notes-dictation";
import { PhotoToInvoice } from "@/components/admin/photo-to-invoice";
import { PreviousItems, type InvoiceLineInput } from "@/components/admin/previous-items";
import { LineRow } from "@/components/admin/line-row";
import { SAVE_FORM_ID } from "@/components/admin/invoice-header";
import { VoiceOrder, type VoiceItem } from "@/components/admin/voice-order";

import { WHOLESALE_MINIMUM_CENTS, dollarsToCents } from "@/lib/invoice-constants";

export interface EditLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  isCredit?: boolean;
  creditReason?: string | null;
}

export interface InvoiceEditFormProps {
  action: string;
  invoiceId: string;
  customerId: string | null;
  customerRole: "CUSTOMER" | "WHOLESALE" | null;
  categories: { slug: string; name: string }[];
  notes: string;
  discount: string; // dollars
  shipping: string;
  tax: string;
  lines: EditLine[];
  sendFormId?: string; // when set, a Send button appears in the sticky bar
  sendLabel?: string;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dollars = (cents: number) => (cents / 100).toFixed(2);

interface Row { description: string; qty: string; unit: string; isCredit?: boolean; creditReason?: string }

const BLANK: Row = { description: "", qty: "1", unit: "" };
const isBlankRow = (r: Row) => !r.description.trim() && !r.unit.trim();

// Append incoming rows after the existing ones, dropping any trailing blank
// placeholder first so added items don't leave a stray empty row behind.
function placeRows(prev: Row[], incoming: Row[]): Row[] {
  const base = [...prev];
  while (base.length && isBlankRow(base[base.length - 1])) base.pop();
  return [...base, ...incoming];
}

export function InvoiceEditForm(props: InvoiceEditFormProps) {
  const [rows, setRows] = useState<Row[]>(
    props.lines.map((l) => ({ description: l.description, qty: String(l.quantity), unit: dollars(Math.abs(l.unitPriceCents)), isCredit: l.isCredit, creditReason: l.creditReason ?? undefined })),
  );
  const [discount, setDiscount] = useState(props.discount);
  const [shipping, setShipping] = useState(props.shipping);
  const [tax, setTax] = useState(props.tax);
  const [notes, setNotes] = useState(props.notes);
  const [notesOpen, setNotesOpen] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const [undo, setUndo] = useState<{ kind: "remove" | "edit"; row: Row; index: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armUndo = (u: { kind: "remove" | "edit"; row: Row; index: number }) => {
    setUndo(u);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 10000);
  };

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { ...BLANK }]);
  const removeRow = (i: number) => {
    setRows((rs) => {
      armUndo({ kind: "remove", row: rs[i], index: i });
      return rs.filter((_, j) => j !== i);
    });
  };
  const doUndo = () => {
    if (!undo) return;
    const u = undo;
    setRows((rs) => {
      const c = [...rs];
      if (u.kind === "remove") c.splice(Math.min(u.index, c.length), 0, u.row);
      else if (u.index < c.length) c[u.index] = u.row;
      return c;
    });
    setUndo(null);
  };

  // Fuzzy-match a spoken name to a line (by description word overlap).
  const findRowByName = (query: string): number => {
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (!words.length) return -1;
    let best = -1;
    let bestScore = 0;
    rows.forEach((r, i) => {
      if (!r.description.trim()) return;
      const d = r.description.toLowerCase();
      const score = words.filter((w) => d.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return bestScore > 0 ? best : -1;
  };
  const removeLineByName = (query: string): string | null => {
    const i = findRowByName(query);
    if (i < 0) return null;
    const name = rows[i].description;
    removeRow(i);
    return name;
  };
  const editLineByName = (query: string, qty: number): string | null => {
    const i = findRowByName(query);
    if (i < 0 || qty < 1) return null;
    armUndo({ kind: "edit", row: rows[i], index: i });
    setRow(i, { qty: String(qty) });
    return rows[i].description;
  };

  // AI assist: current lines for "Pro clean-up", and applying the reviewed rows.
  const assistLines = () => rows.map((r) => ({ description: r.description, quantity: Math.max(1, parseInt(r.qty, 10) || 1) }));
  const applyAssist = (assistRows: AssistRow[], mode: "cleanup" | "photo") => {
    const mapped: Row[] = assistRows.map((a) => ({
      description: a.name,
      qty: String(a.quantity || 1),
      unit: a.priceCents != null ? (a.priceCents / 100).toFixed(2) : "",
    }));
    if (mode === "cleanup") setRows(mapped.length ? mapped : rows);
    else setRows((prev) => placeRows(prev, mapped));
  };

  // Voice order: add one spoken line at a time.
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
    setRows((prev) => placeRows(prev, [row]));
  };

  // Add one or more lines at once (Previous items / Repeat last order / photo).
  const addLines = (lines: InvoiceLineInput[]) => {
    const mapped: Row[] = lines.map((l) => ({ description: l.description, qty: String(l.quantity || 1), unit: l.unitPriceCents ? (l.unitPriceCents / 100).toFixed(2) : "" }));
    setRows((prev) => placeRows(prev, mapped));
  };

  // Add a credit line (negative) from the Add-credit form.
  const addCredit = (c: CreditInput) => {
    const row: Row = { description: c.description, qty: String(c.quantity || 1), unit: (c.amountCentsEach / 100).toFixed(2), isCredit: true, creditReason: c.reason };
    setRows((prev) => placeRows(prev, [row]));
  };

  const lineTotal = (r: Row) => Math.max(0, Math.round(Number(r.qty) || 0)) * dollarsToCents(r.unit);
  const subtotalCents = useMemo(() => rows.filter((r) => !r.isCredit).reduce((s, r) => s + lineTotal(r), 0), [rows]);
  const creditsCents = useMemo(() => rows.filter((r) => r.isCredit).reduce((s, r) => s + lineTotal(r), 0), [rows]);
  const totalCents =
    Math.max(0, subtotalCents - dollarsToCents(discount) + dollarsToCents(shipping) + dollarsToCents(tax) - creditsCents);

  const belowMinimum = props.customerRole === "WHOLESALE" && subtotalCents > 0 && subtotalCents < WHOLESALE_MINIMUM_CENTS;
  const hasItems = rows.some((r) => r.description.trim() || r.unit.trim());

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

  const saveNotes = () => {
    if (notesRef.current) setNotes(notesRef.current.value);
    setNotesOpen(false);
  };

  // The ⋯ menu's rows fire these; the action components stay mounted (outside
  // the dropdown) so their modals survive the menu closing.
  const openPrevItems = useRef<(() => void) | null>(null);
  const openPhoto = useRef<(() => void) | null>(null);
  const openCleanup = useRef<(() => void) | null>(null);

  return (
    <>
      <form id={SAVE_FORM_ID} method="post" action={props.action} onSubmit={onSubmit} className="mt-4 space-y-5">
        {belowMinimum ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Subtotal {money(subtotalCents)} is below the ${WHOLESALE_MINIMUM_CENTS / 100} wholesale minimum. You can still save, but review before sending.
          </div>
        ) : null}

        {/* Line items */}
        <div className="invoice-lines overflow-hidden rounded-xl border border-olive-100 bg-white">
          {!props.customerId && !hasItems ? (
            <p className="px-4 py-6 text-center text-sm text-olive-500">Pick a customer above to get started, then tap the mic or add a line.</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-olive-500">No items yet — tap the mic, add a line, or pull in previous items.</p>
          ) : (
            rows.map((r, i) => (
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
            ))
          )}

          <div className="flex items-center justify-between gap-2 border-t border-olive-50 px-4 py-3">
            <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-sm font-medium text-olive-700 hover:text-olive-900">
              <Plus className="h-4 w-4" /> Add line
            </button>
            {/* Secondary ways to add items live behind a single ⋯ menu. */}
            <MoreMenu triggerLabel="More">
              {(close) => (
                <>
                  {props.customerId ? (
                    <button type="button" onClick={() => { close(); openPrevItems.current?.(); }} className={menuRowCls}>
                      <History className="h-4 w-4 text-olive-500" /> Previous items
                    </button>
                  ) : null}
                  <button type="button" onClick={() => { close(); openPhoto.current?.(); }} className={menuRowCls}>
                    <Camera className="h-4 w-4 text-olive-500" /> From photo
                  </button>
                  {hasItems ? (
                    <button type="button" onClick={() => { close(); openCleanup.current?.(); }} className={menuRowCls}>
                      <Wand2 className="h-4 w-4 text-olive-500" /> Pro clean-up
                    </button>
                  ) : null}
                </>
              )}
            </MoreMenu>
          </div>

          {/* Always-mounted action components (triggers hidden); the ⋯ rows above
              invoke them by ref so their modals persist when the menu closes. */}
          <PreviousItems customerId={props.customerId} onAdd={addLines} renderTrigger={(open) => { openPrevItems.current = open; return null; }} />
          <PhotoToInvoice customerId={props.customerId} categories={props.categories} onAddLine={(line) => addLines([line])} renderTrigger={(open) => { openPhoto.current = open; return null; }} />
          <InvoiceAssist getLines={assistLines} onApply={applyAssist} renderTrigger={(open) => { openCleanup.current = open; return null; }} />
        </div>

        {/* Notes + totals */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-xl border border-olive-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-olive-800">Notes</span>
              <button type="button" onClick={() => setNotesOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50">
                <StickyNote className="h-4 w-4" /> {notes.trim() ? "Edit note" : "Add a note"}
              </button>
            </div>
            {notes.trim() ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-olive-600">{notes}</p>
            ) : (
              <p className="mt-2 text-sm text-olive-400">Payment instructions, PO details, a thank-you — shown on the invoice.</p>
            )}
            {/* Always submit the current note with the form. */}
            <input type="hidden" name="notes" value={notes} />
          </div>

          <div className="rounded-xl border border-olive-100 bg-white p-4 text-sm">
            <SummaryRow label="Subtotal" value={money(subtotalCents)} />
            <Adjust label="Discount" name="discount" value={discount} onChange={setDiscount} />
            <Adjust label="Delivery" name="shipping" value={shipping} onChange={setShipping} />
            <Adjust label="Tax" name="tax" value={tax} onChange={setTax} />
            {creditsCents > 0 ? (
              <div className="flex items-center justify-between py-1 text-amber-700">
                <span>Credits</span><span>−{money(creditsCents)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex justify-end">
              <AddCredit
                customerId={props.customerId}
                onAdd={addCredit}
                renderTrigger={(open) => (
                  <button type="button" onClick={open} className="inline-flex items-center gap-1 text-xs font-medium text-olive-600 hover:text-olive-900">
                    <Undo2 className="h-3.5 w-3.5" /> Add credit
                  </button>
                )}
              />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-olive-100 pt-2 text-base font-semibold text-olive-900">
              <span>Total</span><span>{money(totalCents)}</span>
            </div>
          </div>
        </div>

        {saveError ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-right text-sm text-red-700">{saveError}</p>
        ) : null}
      </form>

      {/* Voice: one floating mic (renders itself, bottom-left). */}
      <VoiceOrder onAddLine={addVoiceLine} onRemoveLine={removeLineByName} onEditLine={editLineByName} customerId={props.customerId} invoiceId={props.invoiceId} />

      {/* Sticky bottom bar — live total + Save / Send, beside the mic. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-olive-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] text-olive-500">Total</p>
            <p className="text-lg font-semibold leading-tight text-olive-900">{money(totalCents)}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {props.sendFormId ? (
              <button type="submit" form={props.sendFormId} className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50">
                <Send className="h-4 w-4" /> {props.sendLabel ?? "Send"}
              </button>
            ) : null}
            <button type="submit" form={SAVE_FORM_ID} className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      </div>

      {/* Notes popup — type or dictate, preview after. */}
      {notesOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setNotesOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 font-display text-lg text-olive-900"><StickyNote className="h-5 w-5 text-olive-700" /> Note</h3>
              <button type="button" onClick={() => setNotesOpen(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-4 py-3">
              <div className="relative">
                <textarea ref={notesRef} defaultValue={notes} rows={5} autoFocus className="w-full rounded-lg border border-olive-200 px-3 py-2 pr-11 text-sm focus:border-olive-500 focus:outline-none" placeholder="Type or tap the mic to dictate…" />
                <NotesDictation targetRef={notesRef} />
              </div>
              <p className="mt-1 text-xs text-olive-400">Shown on the invoice the customer sees.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-olive-100 px-4 py-3">
              <button type="button" onClick={() => setNotesOpen(false)} className="rounded-lg border border-olive-200 px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">Cancel</button>
              <button type="button" onClick={saveNotes} className="rounded-lg bg-olive-900 px-5 py-2 text-sm font-medium text-white hover:bg-olive-800">Save note</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Undo toast after removing a line */}
      {undo ? (
        <div className="fixed bottom-[8.5rem] left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-full bg-olive-900 px-4 py-2 text-sm text-white shadow-lg">
          {undo.kind === "edit" ? "Line updated" : "Line removed"}
          <button type="button" onClick={doUndo} className="font-semibold text-emerald-300 underline">Undo</button>
        </div>
      ) : null}
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
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
