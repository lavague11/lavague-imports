"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

// Small mic for the Notes box: tap to dictate, tap to stop. Transcribes with the
// same speech-to-text (Arabic + English, auto-detect), cleans the text up with
// Sonnet (professional English, meaning/numbers/dates kept), and inserts at the
// cursor in the target textarea.

export function NotesDictation({ targetRef }: { targetRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const [status, setStatus] = useState<"idle" | "recording" | "working">("idle");
  const [err, setErr] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const insert = (text: string) => {
    const ta = targetRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const sep = before && !/\s$/.test(before) ? " " : "";
    ta.value = `${before}${sep}${text}${after}`;
    const pos = (before + sep + text).length;
    ta.focus();
    try { ta.setSelectionRange(pos, pos); } catch { /* ignore */ }
  };

  const process = async (blob: Blob) => {
    setStatus("working");
    setErr(false);
    try {
      const afd = new FormData();
      afd.append("audio", blob, "note.webm");
      const t = await (await fetch("/admin/invoices/voice/transcribe", { method: "POST", body: afd })).json();
      if (t.configured === false || !t.text) { setErr(true); return; }
      const cfd = new FormData();
      cfd.append("text", t.text);
      const c = await (await fetch("/admin/invoices/voice/notes", { method: "POST", body: cfd })).json();
      insert(c.text || t.text);
    } catch {
      setErr(true);
    } finally {
      setStatus("idle");
    }
  };

  const start = async () => {
    setErr(false);
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
      recRef.current = rec;
      rec.start();
      setStatus("recording");
    } catch {
      setErr(true);
    }
  };

  const stop = () => { recRef.current?.stop(); recRef.current = null; };

  return (
    <button
      type="button"
      onClick={status === "recording" ? stop : status === "idle" ? start : undefined}
      disabled={status === "working"}
      title={err ? "Dictation failed — tap to retry" : "Dictate a note"}
      aria-label="Dictate a note"
      className={`absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border ${
        status === "recording" ? "border-red-300 bg-red-50 text-red-600" : err ? "border-red-200 text-red-500" : "border-olive-200 bg-white text-olive-600 hover:bg-olive-50"
      }`}
    >
      {status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "recording" ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
