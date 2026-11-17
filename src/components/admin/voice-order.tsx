"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, Square, X } from "lucide-react";

export interface VoiceItem {
  heard: string;
  name: string;
  brand: string;
  sku: string;
  packSize: string;
  quantity: number;
  unit: "piece" | "case";
  priceCents: number | null;
  priceSource: "spoken" | "catalog" | "none";
  matchTag: "matched" | "best guess" | "not in catalog";
  imageUrl: string | null;
}

const MATCH_TAG: Record<string, { label: string; cls: string }> = {
  matched: { label: "matched", cls: "bg-emerald-100 text-emerald-700" },
  "best guess": { label: "best guess", cls: "bg-amber-100 text-amber-800" },
  "not in catalog": { label: "not in catalog", cls: "bg-olive-100 text-olive-600" },
};
const PRICE_TAG: Record<string, { label: string; cls: string }> = {
  spoken: { label: "spoken price", cls: "bg-sky-100 text-sky-700" },
  catalog: { label: "catalog price", cls: "bg-olive-100 text-olive-600" },
  none: { label: "no price", cls: "bg-olive-100 text-olive-500" },
};

const money = (c: number | null) => (c != null ? `$${(c / 100).toFixed(2)}` : "—");

export function VoiceOrder({ onAddLine }: { onAddLine: (item: VoiceItem) => void }) {
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing" | "matching">("idle");
  const [transcript, setTranscript] = useState("");
  const [queue, setQueue] = useState<VoiceItem[]>([]);
  const [tally, setTally] = useState({ added: 0, skipped: 0 });
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const current = queue[0] ?? null;

  const process = useCallback(async (blob: Blob) => {
    setStatus("transcribing");
    setNote(null);
    try {
      const afd = new FormData();
      afd.append("audio", blob, "order.webm");
      const tRes = await fetch("/admin/invoices/voice/transcribe", { method: "POST", body: afd });
      const tData = await tRes.json();
      if (tData.configured === false) { setNote("Voice ordering needs an OPENAI_API_KEY — add it under /developers."); setStatus("idle"); return; }
      if (!tData.text) { setNote("Didn't catch any speech — try again."); setStatus("idle"); return; }
      setTranscript(tData.text);

      setStatus("matching");
      const mfd = new FormData();
      mfd.append("transcript", tData.text);
      const mRes = await fetch("/admin/invoices/voice/match", { method: "POST", body: mfd });
      const mData = await mRes.json();
      if (mData.configured === false) { setNote("Matching needs an ANTHROPIC_API_KEY — add it under /developers."); setStatus("idle"); return; }
      const items: VoiceItem[] = Array.isArray(mData.items) ? mData.items : [];
      if (items.length === 0) setNote("Couldn't pull any items out of that — try again.");
      setQueue(items);
      setTally({ added: 0, skipped: 0 });
      setDone(false);
    } catch {
      setNote("Couldn't process the recording — try again.");
    } finally {
      setStatus("idle");
    }
  }, []);

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
      setNote("Couldn't access the microphone. Allow mic access and try again.");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const answer = useCallback((yes: boolean) => {
    setQueue((q) => {
      const [first, ...rest] = q;
      if (first && yes) onAddLine(first);
      setTally((t) => ({ added: t.added + (yes ? 1 : 0), skipped: t.skipped + (yes ? 0 : 1) }));
      if (rest.length === 0) setDone(true);
      return rest;
    });
  }, [onAddLine]);

  // Desktop shortcuts: Enter = Yes, Esc = No, while a card is showing.
  useEffect(() => {
    if (!current) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); answer(true); }
      else if (e.key === "Escape") { e.preventDefault(); answer(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [current, answer]);

  const recording = status === "recording";
  const busy = status === "transcribing" || status === "matching";

  return (
    <>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
          recording ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" : "border-olive-300 bg-white text-olive-800 hover:bg-olive-50"
        }`}
      >
        {recording ? <><Square className="h-4 w-4 fill-current" /> Stop</> : <><Mic className="h-4 w-4" /> {busy ? (status === "transcribing" ? "Transcribing…" : "Matching…") : "Speak"}</>}
      </button>
      {recording ? <p className="mt-1 text-right text-xs text-red-600">Listening… tap Stop when you&apos;re done.</p> : null}
      {note ? <p className="mt-1 text-right text-xs text-olive-500">{note}</p> : null}

      {/* Item card (one at a time, queued) */}
      {current ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-olive-500">{queue.length} item{queue.length === 1 ? "" : "s"} left</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_TAG[current.matchTag]?.cls ?? MATCH_TAG["not in catalog"].cls}`}>
                {MATCH_TAG[current.matchTag]?.label ?? current.matchTag}
              </span>
            </div>

            <p className="mt-2 text-xs text-olive-500">Heard: <span className="text-olive-700">&ldquo;{current.heard}&rdquo;</span></p>

            <div className="mt-3 flex gap-3">
              {current.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={current.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-olive-100 object-cover" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-olive-200 text-xs text-olive-400">No photo</div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-olive-900">{current.name || "Unknown item"}</p>
                <p className="text-xs text-olive-500">{[current.brand, current.packSize].filter(Boolean).join(" · ") || " "}</p>
                <p className="text-xs text-olive-500">{current.sku ? `SKU ${current.sku}` : "No SKU"}</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-olive-50/60 p-2 text-center text-sm">
              <div><p className="text-[11px] text-olive-500">Qty</p><p className="font-semibold text-olive-900">{current.quantity} {current.unit === "case" ? "case" : "pc"}</p></div>
              <div><p className="text-[11px] text-olive-500">Price</p><p className="font-semibold text-olive-900">{money(current.priceCents)}</p></div>
              <div><p className="text-[11px] text-olive-500">Line total</p><p className="font-semibold text-olive-900">{current.priceCents != null ? money(current.priceCents * current.quantity) : "—"}</p></div>
            </div>
            <div className="mt-1.5 text-center">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRICE_TAG[current.priceSource]?.cls ?? PRICE_TAG.none.cls}`}>{PRICE_TAG[current.priceSource]?.label ?? "no price"}</span>
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => answer(true)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-olive-900 py-3 text-base font-semibold text-white hover:bg-olive-800">
                <Check className="h-5 w-5" /> Yes
              </button>
              <button type="button" onClick={() => answer(false)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-olive-200 py-3 text-base font-semibold text-olive-700 hover:bg-olive-50">
                <X className="h-5 w-5" /> No
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-olive-400">Enter = Yes · Esc = No</p>
          </div>
        </div>
      ) : null}

      {/* Summary after Stop */}
      {done && !current ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDone(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl text-olive-900">{tally.added} added · {tally.skipped} skipped</p>
            {transcript ? <p className="mt-2 text-xs text-olive-500">Heard: &ldquo;{transcript}&rdquo;</p> : null}
            <button type="button" onClick={() => setDone(false)} className="mt-4 w-full rounded-lg bg-olive-900 py-2.5 text-sm font-medium text-white hover:bg-olive-800">Done</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
