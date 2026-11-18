"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, Undo2, UserCheck, X } from "lucide-react";

import { CREDIT_REASONS } from "@/lib/invoice-constants";

export interface VoiceItem {
  heard: string;
  name: string;
  brand: string;
  sku: string;
  packSize: string;
  quantity: number;
  quantitySpoken?: boolean;
  unit: "piece" | "case";
  priceCents: number | null;
  priceSource: "spoken" | "catalog" | "none";
  matchTag: "matched" | "best guess" | "not in catalog";
  imageUrl: string | null;
  isCredit?: boolean;
  creditReason?: string;
}

interface DetectedCustomer { id: string; label: string }

const MATCH_TAG: Record<string, { label: string; cls: string }> = {
  matched: { label: "matched", cls: "bg-emerald-100 text-emerald-700" },
  "best guess": { label: "best guess", cls: "bg-amber-100 text-amber-800" },
  "not in catalog": { label: "not in catalog", cls: "bg-olive-100 text-olive-600" },
};
const PRICE_TAG: Record<string, { label: string; cls: string }> = {
  spoken: { label: "spoken price", cls: "bg-sky-100 text-sky-700" },
  last: { label: "last paid", cls: "bg-emerald-100 text-emerald-700" },
  catalog: { label: "catalog price", cls: "bg-olive-100 text-olive-600" },
  none: { label: "no price", cls: "bg-olive-100 text-olive-500" },
};

const money = (c: number | null) => (c != null ? `$${(c / 100).toFixed(2)}` : "—");

// STT confidence → a short, honest chip. null = deployment didn't return logprobs.
function confidenceChip(conf: number | null | undefined) {
  if (conf == null) return null;
  if (conf >= 0.75) return { label: "heard clearly", cls: "bg-emerald-100 text-emerald-700" };
  if (conf >= 0.5) return { label: "fairly sure", cls: "bg-amber-100 text-amber-800" };
  return { label: "not sure — double-check", cls: "bg-red-100 text-red-700" };
}

const QUICK_QTY = [1, 2, 3, 6, 12, 24];

export function VoiceOrder({
  onAddLine,
  customerId,
  invoiceId,
}: {
  onAddLine: (item: VoiceItem) => void;
  customerId?: string | null;
  invoiceId?: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing" | "matching">("idle");
  const [transcript, setTranscript] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [queue, setQueue] = useState<VoiceItem[]>([]);
  const [tally, setTally] = useState({ added: 0, skipped: 0 });
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [heardCustomer, setHeardCustomer] = useState<string | null>(null);

  // Customer detected by voice, pending a "make this invoice for them?" confirm.
  const [pendingCustomer, setPendingCustomer] = useState<DetectedCustomer | null>(null);
  const [customerHandled, setCustomerHandled] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const custFormRef = useRef<HTMLFormElement | null>(null);
  const assignIdRef = useRef<string>("");

  // Per-card edit state.
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const current = queue[0] ?? null;
  const askingCustomer = Boolean(
    pendingCustomer && !customerHandled && invoiceId && pendingCustomer.id !== customerId,
  );

  // Resume a queue stashed before a customer-assign page reload (same tab).
  useEffect(() => {
    if (!invoiceId || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(`voiceQueue:${invoiceId}`);
      if (!raw) return;
      sessionStorage.removeItem(`voiceQueue:${invoiceId}`);
      const data = JSON.parse(raw) as { items?: VoiceItem[]; transcript?: string; confidence?: number | null; heardCustomer?: string | null };
      setCustomerHandled(true);
      setTranscript(data.transcript ?? "");
      setConfidence(data.confidence ?? null);
      setHeardCustomer(data.heardCustomer ?? null);
      setTally({ added: 0, skipped: 0 });
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length) setQueue(items);
      else setDone(true);
    } catch {
      /* ignore */
    }
  }, [invoiceId]);

  // Reset the editable fields whenever a new card comes to the front.
  useEffect(() => {
    if (!current) return;
    setQty(current.quantitySpoken ? String(current.quantity || 1) : "");
    setReason("");
  }, [current]);

  const process = useCallback(
    async (blob: Blob) => {
      setStatus("transcribing");
      setNote(null);
      try {
        const afd = new FormData();
        afd.append("audio", blob, "order.webm");
        const tRes = await fetch("/admin/invoices/voice/transcribe", { method: "POST", body: afd });
        const tData = await tRes.json();
        if (tData.configured === false) { setNote("Voice ordering needs an OPENAI_API_KEY — add it under /developers."); setStatus("idle"); return; }
        if (!tData.text) { setNote("Didn't catch any speech — tap and try again."); setStatus("idle"); return; }
        setTranscript(tData.text);
        setConfidence(typeof tData.confidence === "number" ? tData.confidence : null);

        setStatus("matching");
        const mfd = new FormData();
        mfd.append("transcript", tData.text);
        if (customerId) mfd.append("customerId", customerId);
        const mRes = await fetch("/admin/invoices/voice/match", { method: "POST", body: mfd });
        const mData = await mRes.json();
        if (mData.configured === false) { setNote("Matching needs an ANTHROPIC_API_KEY — add it under /developers."); setStatus("idle"); return; }
        setHeardCustomer(mData.customer?.label || mData.heardCustomer || null);
        setPendingCustomer(mData.customer?.id ? { id: mData.customer.id, label: mData.customer.label } : null);
        setCustomerHandled(false);
        const items: VoiceItem[] = Array.isArray(mData.items) ? mData.items : [];
        if (items.length === 0 && !mData.customer?.id) setNote("Couldn't pull any items out of that — tap and try again.");
        setQueue(items);
        setTally({ added: 0, skipped: 0 });
        setDone(false);
      } catch {
        setNote("Couldn't process the recording — tap and try again.");
      } finally {
        setStatus("idle");
      }
    },
    [customerId],
  );

  const start = async () => {
    setNote(null);
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size) void process(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setStatus("recording");
    } catch {
      setNote("Couldn't access the microphone. Allow mic access and tap again.");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  // Assign the voice-detected customer. Stash the queue, then full-page POST
  // (host-safe) to the customer route; the page reloads and we resume the queue.
  const confirmCustomer = (yes: boolean) => {
    if (!yes || !pendingCustomer || !invoiceId) { setCustomerHandled(true); return; }
    try {
      sessionStorage.setItem(
        `voiceQueue:${invoiceId}`,
        JSON.stringify({ items: queue, transcript, confidence, heardCustomer: pendingCustomer.label }),
      );
    } catch { /* ignore */ }
    assignIdRef.current = pendingCustomer.id;
    // Let the hidden form pick up the id, then submit on the next tick.
    setTimeout(() => custFormRef.current?.submit(), 0);
  };

  const answer = useCallback(
    (yes: boolean) => {
      const first = queue[0];
      const q = Math.max(1, parseInt(qty, 10) || 0);
      if (yes && first) {
        if (q < 1) return; // need a quantity first
        const effReason = first.creditReason || reason;
        if (first.isCredit && !effReason) return; // a credit needs a reason first
        const item: VoiceItem = { ...first, quantity: q };
        onAddLine(first.isCredit ? { ...item, creditReason: effReason } : item);
      }
      setTally((t) => ({ added: t.added + (yes ? 1 : 0), skipped: t.skipped + (yes ? 0 : 1) }));
      setQueue((qq) => { const rest = qq.slice(1); if (rest.length === 0) setDone(true); return rest; });
    },
    [queue, qty, reason, onAddLine],
  );

  // Desktop shortcuts: Enter = Yes, Esc = No, while an item card is showing.
  useEffect(() => {
    if (!current || askingCustomer) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); answer(true); }
      else if (e.key === "Escape") { e.preventDefault(); answer(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [current, askingCustomer, answer]);

  const recording = status === "recording";
  const busy = status === "transcribing" || status === "matching";
  const btnLabel = recording ? "Listening… tap to stop" : busy ? (status === "transcribing" ? "Transcribing…" : "Matching…") : "Speak";
  const conf = confidenceChip(confidence);

  const qtyNum = Math.max(0, parseInt(qty, 10) || 0);
  const isCredit = Boolean(current?.isCredit);
  const effReason = current?.creditReason || reason;
  const yesBlocked = qtyNum < 1 || (isCredit && !effReason);

  return (
    <>
      {/* The one button — all status lives inside it; red while recording. */}
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={busy}
        aria-pressed={recording}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-70 ${
          recording
            ? "border-red-400 bg-red-600 text-white hover:bg-red-700"
            : "border-olive-300 bg-white text-olive-800 hover:bg-olive-50"
        }`}
      >
        {recording ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> : <Mic className="h-4 w-4" />}
        {btnLabel}
      </button>
      {note ? <p className="mt-1 w-full text-right text-xs text-olive-500">{note}</p> : null}

      {/* Hidden form that assigns the detected customer (full-page POST → reload). */}
      {invoiceId ? (
        <form ref={custFormRef} method="post" action={`/admin/invoices/${invoiceId}/customer`} className="hidden">
          <input type="hidden" name="mode" value="existing" />
          <input type="hidden" name="customerId" value={pendingCustomer?.id ?? ""} />
        </form>
      ) : null}

      {/* Step 1 — "Make this invoice for …?" */}
      {askingCustomer && pendingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2 text-olive-500">
              <UserCheck className="h-5 w-5 text-olive-600" />
              <span className="text-xs font-medium">I heard a customer</span>
            </div>
            <p className="mt-2 text-sm text-olive-700">Make this invoice for</p>
            <p className="font-display text-xl text-olive-900">{pendingCustomer.label}?</p>
            {heardCustomer && heardCustomer !== pendingCustomer.label ? (
              <p className="mt-1 text-xs text-olive-400">You said: &ldquo;{heardCustomer}&rdquo;</p>
            ) : null}
            {queue.length ? <p className="mt-2 text-xs text-olive-500">Then I&apos;ll go through {queue.length} item{queue.length === 1 ? "" : "s"}.</p> : null}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => confirmCustomer(true)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-olive-900 py-3 text-base font-semibold text-white hover:bg-olive-800">
                <Check className="h-5 w-5" /> Yes, set them
              </button>
              <button type="button" onClick={() => confirmCustomer(false)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-olive-200 py-3 text-base font-semibold text-olive-700 hover:bg-olive-50">
                <X className="h-5 w-5" /> Skip
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Step 2 — item cards, one at a time */}
      {current && !askingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className={`w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ${isCredit ? "ring-2 ring-amber-300" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-olive-800">{isCredit ? "Add this credit?" : "Is this the item?"}</span>
              {isCredit ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"><Undo2 className="h-3 w-3" /> Credit</span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_TAG[current.matchTag]?.cls ?? MATCH_TAG["not in catalog"].cls}`}>
                  {MATCH_TAG[current.matchTag]?.label ?? current.matchTag}
                </span>
              )}
            </div>

            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-olive-500">
              Heard: <span className="text-olive-700">&ldquo;{current.heard}&rdquo;</span>
              {conf ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${conf.cls}`}>{conf.label}</span> : null}
            </p>

            <div className="mt-3 flex gap-3">
              {current.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={current.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-olive-100 object-cover" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-olive-200 text-xs text-olive-400">{isCredit ? "Credit" : "No photo"}</div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-olive-900">{current.name || "Unknown item"}</p>
                <p className="text-xs text-olive-500">{[current.brand, current.packSize].filter(Boolean).join(" · ") || " "}</p>
                <p className="text-xs text-olive-500">{current.sku ? `SKU ${current.sku}` : isCredit ? "Credit line" : "No SKU"}</p>
              </div>
            </div>

            {isCredit ? (
              <div className="mt-3">
                <label className="mb-1 block text-[11px] text-olive-500">Reason {effReason ? "" : <span className="text-red-500">— required</span>}</label>
                {current.creditReason ? (
                  <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-sm font-medium text-amber-800">{current.creditReason}</p>
                ) : (
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 w-full rounded-lg border border-olive-200 px-2 text-sm focus:border-olive-500 focus:outline-none">
                    <option value="">What&apos;s the reason for the credit?</option>
                    {CREDIT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
            ) : null}

            {/* Quantity — if it wasn't spoken, ask for it conversationally. */}
            <div className="mt-3">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] text-olive-500">
                {current.quantitySpoken ? "Quantity" : <span className="font-medium text-olive-700">How many{isCredit ? "" : ` ${current.unit === "case" ? "cases" : "pieces"}`}?</span>}
                {!current.quantitySpoken && qtyNum < 1 ? <span className="text-red-500">— tell me</span> : null}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={qty}
                  autoFocus={!current.quantitySpoken}
                  onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="h-10 w-20 rounded-lg border border-olive-200 px-3 text-center text-base font-semibold focus:border-olive-500 focus:outline-none"
                />
                <span className="text-xs text-olive-500">{current.unit === "case" ? "case(s)" : "piece(s)"}</span>
                <div className="ml-auto flex gap-1">
                  {QUICK_QTY.map((n) => (
                    <button key={n} type="button" onClick={() => setQty(String(n))} className={`h-8 w-8 rounded-lg border text-sm ${qtyNum === n ? "border-olive-800 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}>{n}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-olive-50/60 p-2 text-center text-sm">
              <div><p className="text-[11px] text-olive-500">Qty</p><p className="font-semibold text-olive-900">{qtyNum || "—"} {current.unit === "case" ? "case" : "pc"}</p></div>
              <div><p className="text-[11px] text-olive-500">{isCredit ? "Credit each" : "Price"}</p><p className="font-semibold text-olive-900">{money(current.priceCents)}</p></div>
              <div><p className="text-[11px] text-olive-500">{isCredit ? "Credit total" : "Line total"}</p><p className={`font-semibold ${isCredit ? "text-amber-700" : "text-olive-900"}`}>{current.priceCents != null && qtyNum ? `${isCredit ? "−" : ""}${money(current.priceCents * qtyNum)}` : "—"}</p></div>
            </div>
            {!isCredit ? (
              <div className="mt-1.5 text-center">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRICE_TAG[current.priceSource]?.cls ?? PRICE_TAG.none.cls}`}>{PRICE_TAG[current.priceSource]?.label ?? "no price"}</span>
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => answer(true)} disabled={yesBlocked} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-olive-900 py-3 text-base font-semibold text-white hover:bg-olive-800 disabled:opacity-50">
                <Check className="h-5 w-5" /> Yes, add it
              </button>
              <button type="button" onClick={() => answer(false)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-olive-200 py-3 text-base font-semibold text-olive-700 hover:bg-olive-50">
                <X className="h-5 w-5" /> Skip
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-olive-400">
              {qtyNum < 1 ? "Enter a quantity to add this item" : isCredit && !effReason ? "Pick a reason to add this credit" : "Enter = Yes · Esc = Skip"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Summary after the last card */}
      {done && !current && !askingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDone(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl text-olive-900">{tally.added} added · {tally.skipped} skipped</p>
            {heardCustomer && !customerId ? (
              <p className="mt-1 text-sm text-olive-700">For: <span className="font-medium">{heardCustomer}</span> <span className="text-xs text-olive-400">— pick them in the customer bar</span></p>
            ) : null}
            {transcript ? <p className="mt-2 text-xs text-olive-500">Heard: &ldquo;{transcript}&rdquo;</p> : null}
            <button type="button" onClick={() => setDone(false)} className="mt-4 w-full rounded-lg bg-olive-900 py-2.5 text-sm font-medium text-white hover:bg-olive-800">Done</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
