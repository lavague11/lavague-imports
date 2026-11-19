"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, Radio, Square, Undo2, UserCheck, UserPlus, Volume2, VolumeX, X } from "lucide-react";

import { CREDIT_REASONS } from "@/lib/invoice-constants";

export interface CatalogHit {
  name: string;
  brand: string | null;
  sku: string;
  packSize: string;
  priceCents: number | null;
  imageUrl: string | null;
}

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
  priceSource: "spoken" | "catalog" | "last" | "none";
  matchTag: "matched" | "best guess" | "not in catalog";
  imageUrl: string | null;
  isCredit?: boolean;
  creditReason?: string;
  alternatives?: CatalogHit[];
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
const ciCls = "h-9 w-full rounded-lg border border-olive-200 px-2.5 text-sm focus:border-olive-500 focus:outline-none";

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
const sayMoney = (c: number | null) => (c != null ? `${(c / 100).toFixed(2)} dollars` : "");
const unitWord = (unit: "piece" | "case", qty: number) =>
  unit === "case" ? (qty === 1 ? "case" : "cases") : qty === 1 ? "piece" : "pieces";

// What the assistant reads aloud for a card.
function cardPhrase(it: VoiceItem): string {
  if (it.isCredit) {
    const nm = it.name && it.name !== "Credit" ? `, ${it.name}` : "";
    const amt = it.priceCents != null ? `, ${sayMoney(it.priceCents)} each` : "";
    return `Credit, ${it.creditReason || "other"}${nm}${amt}. Add this credit?`;
  }
  const parts = [it.name, it.brand].filter(Boolean).join(", ");
  const price = it.priceCents != null ? `, ${sayMoney(it.priceCents)} each` : "";
  if (it.quantitySpoken) {
    return `${it.quantity} ${unitWord(it.unit, it.quantity)} ${parts}${price}. Is this the item?`;
  }
  return `${parts}${price}. How many ${it.unit === "case" ? "cases" : "pieces"}?`;
}

// Parse a spoken answer to an item card (English + Arabic).
type Answer =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "select"; n: number }
  | { kind: "qty"; n: number }
  | { kind: "unknown" };

function parseAnswer(raw: string): Answer {
  const text = raw.trim();
  const t = text.toLowerCase();
  if (!t) return { kind: "unknown" };
  // Pick an alternative: "the second one", "number two", etc.
  const ord = /\b(first|1st)\b/.test(t) ? 1 : /\b(second|2nd)\b/.test(t) ? 2 : /\b(third|3rd)\b/.test(t) ? 3 : 0;
  if (ord) return { kind: "select", n: ord };
  // Quantity: "make it 3", "3 cases", or a bare number.
  const mk = t.match(/\bmake it (\d{1,3})\b/) || t.match(/\b(\d{1,3})\s*(?:cases?|pieces?|pcs?|units?|box(?:es)?)\b/) || t.match(/^(\d{1,3})$/);
  if (mk) return { kind: "qty", n: parseInt(mk[1], 10) };
  // Yes (English + Arabic).
  if (/\b(yes|yeah|yep|yup|correct|right|sure|add it|add|aywa|aiwa|na3am|naam|tamam|sah|sahih)\b/.test(t) || /نعم|ايوه|أيوة|ايوة|تمام|صح|اه|اوك/.test(text)) {
    return { kind: "yes" };
  }
  // No / skip (English + Arabic).
  if (/\b(no|nope|nah|skip|wrong|next|la|laa|mush|mish)\b/.test(t) || /\bلا\b|^لا|مش|خطأ|تخطي/.test(text)) {
    return { kind: "no" };
  }
  return { kind: "unknown" };
}

// A spoken command to change an already-added line (remove / edit quantity).
type Command =
  | { kind: "remove"; query: string }
  | { kind: "editQty"; query: string; n: number };

function parseCommand(raw: string): Command | null {
  const low = raw.trim().toLowerCase();
  let m = low.match(/\b(?:remove|delete|cancel|scratch|take off|get rid of|drop)\s+(?:the\s+)?(.+)/);
  if (m) {
    const query = m[1].replace(/\b(line|item|from (?:the )?order|please|thanks?)\b/g, "").trim();
    if (query && !/^(it|that|this)$/.test(query)) return { kind: "remove", query };
  }
  m = low.match(/\b(?:change|make|set|update)\s+(?:the\s+)?(.+?)\s+(?:to|at)\s+(\d{1,3})\b/);
  if (m) {
    const query = m[1].trim();
    const n = parseInt(m[2], 10);
    if (query && n > 0 && !/^(it|that|this)$/.test(query)) return { kind: "editQty", query, n };
  }
  return null;
}

// A bare "Other" from the model usually means no reason was actually stated, so
// clear it → the card then asks for a reason ("No reason given → ask for one").
const clearDefaultReason = (items: VoiceItem[]): VoiceItem[] =>
  items.map((it) => (it.isCredit && it.creditReason === "Other" ? { ...it, creditReason: "" } : it));

// Map a spoken reason to one of the CREDIT_REASONS, or null.
function parseReason(raw: string): string | null {
  const t = raw.toLowerCase();
  if (/\bdamag|\bbroke|broken|crush/.test(t)) return "Damaged";
  if (/\bexpir/.test(t)) return "Expired";
  if (/\breturn/.test(t)) return "Returned";
  if (/\bshort|missing|didn.?t (?:come|arrive)|not delivered/.test(t)) return "Short delivery";
  if (/\bcourtesy|free|goodwill|on us\b/.test(t)) return "Courtesy";
  if (/\bprice|adjust/.test(t)) return "Price adjustment";
  return null;
}

export function VoiceOrder({
  onAddLine,
  onRemoveLine,
  onEditLine,
  customerId,
  invoiceId,
}: {
  onAddLine: (item: VoiceItem) => void;
  onRemoveLine?: (query: string) => string | null;
  onEditLine?: (query: string, qty: number) => string | null;
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
  const [customerAlts, setCustomerAlts] = useState<DetectedCustomer[]>([]);
  const [customerConfident, setCustomerConfident] = useState(true);
  const [customerHandled, setCustomerHandled] = useState(false);
  const [custMode, setCustMode] = useState<"confirm" | "new">("confirm");
  const [newBusiness, setNewBusiness] = useState("");
  const [assignId, setAssignId] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const custFormRef = useRef<HTMLFormElement | null>(null);
  const newFormRef = useRef<HTMLFormElement | null>(null);

  // Per-card edit state.
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  // "Change match" panel: pick an alternative, search the catalog, or create a
  // new product (only when tapped, after a duplicate check).
  const [changing, setChanging] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [dupe, setDupe] = useState<CatalogHit | null>(null);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spoken replies (TTS) + tap-to-answer-by-voice.
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(true);
  const [answering, setAnswering] = useState(false);
  const lastSpokenRef = useRef<string>("");

  useEffect(() => {
    try {
      const v = localStorage.getItem("voiceReplies");
      if (v === "off") { setVoiceOn(false); voiceOnRef.current = false; }
    } catch { /* ignore */ }
  }, []);
  const toggleVoice = () =>
    setVoiceOn((v) => {
      const nv = !v;
      voiceOnRef.current = nv;
      try { localStorage.setItem("voiceReplies", nv ? "on" : "off"); } catch { /* ignore */ }
      if (!nv && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      return nv;
    });

  // Live listening (item 5): one tap starts a continuous mic session that
  // segments speech by pauses, matches each utterance, and appends cards.
  const [live, setLive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const liveRef = useRef(false);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveRecRef = useRef<MediaRecorder | null>(null);
  const liveAcRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speakingRef = useRef(false);
  const liveCustomerRef = useRef<{ customer: DetectedCustomer; alts: DetectedCustomer[]; confident: boolean; heard: string | null } | null>(null);
  // Keep the line handlers current for commands fired from captured closures.
  const onRemoveLineRef = useRef(onRemoveLine);
  const onEditLineRef = useRef(onEditLine);
  useEffect(() => { onRemoveLineRef.current = onRemoveLine; onEditLineRef.current = onEditLine; });

  const current = queue[0] ?? null;
  // Ask about the customer when a name was heard and it's unresolved: a detected
  // match that differs from the current customer, or no match at all (offer new).
  const detectedDiffers = Boolean(pendingCustomer && pendingCustomer.id !== customerId);
  const noMatchButHeard = Boolean(!pendingCustomer && heardCustomer && !customerId);
  const askingCustomer = Boolean(!customerHandled && invoiceId && (detectedDiffers || noMatchButHeard));

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
      if (items.length) {
        setQueue(items);
        // The customer is now set — re-price matched, non-spoken items against
        // their last-paid price for this customer.
        if (customerId) void repriceQueue(items, customerId);
      } else {
        setDone(true);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const repriceQueue = async (items: VoiceItem[], custId: string) => {
    try {
      const r = await fetch("/admin/invoices/voice/reprice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: custId, items: items.map((i) => ({ sku: i.sku, name: i.name })) }),
      });
      const d = await r.json();
      const prices: Record<string, number> = d.prices ?? {};
      if (!Object.keys(prices).length) return;
      setQueue((qq) =>
        qq.map((it) => {
          if (it.priceSource === "spoken" || it.isCredit) return it;
          const p = prices[it.sku] ?? prices[it.name];
          return p != null ? { ...it, priceCents: p, priceSource: "last" } : it;
        }),
      );
    } catch {
      /* ignore */
    }
  };

  // Reset the editable fields whenever a new card comes to the front. Auto-open
  // the "change match" panel when nothing matched, so the admin can fix it.
  useEffect(() => {
    if (!current) return;
    setQty(current.quantitySpoken ? String(current.quantity || 1) : "");
    setReason("");
    setChanging(!current.isCredit && current.matchTag === "not in catalog");
    setSearchQ("");
    setResults([]);
    setDupe(null);
    setCreating(false);
  }, [current]);

  // Adopt a catalog product onto the front card (keeps a spoken price).
  const adopt = (hit: CatalogHit) => {
    setQueue((qq) => {
      if (!qq.length) return qq;
      const [first, ...rest] = qq;
      const keepSpoken = first.priceSource === "spoken";
      return [
        {
          ...first,
          name: hit.name,
          brand: hit.brand ?? "",
          sku: hit.sku,
          packSize: hit.packSize,
          imageUrl: hit.imageUrl,
          priceCents: keepSpoken ? first.priceCents : hit.priceCents,
          priceSource: keepSpoken ? "spoken" : hit.priceCents != null ? "catalog" : "none",
          matchTag: "matched",
        },
        ...rest,
      ];
    });
    setChanging(false);
    setDupe(null);
    setResults([]);
    setSearchQ("");
  };

  const runSearch = (q: string) => {
    setSearchQ(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/admin/invoices/voice/search?q=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        setResults(Array.isArray(d.results) ? d.results : []);
      } catch { /* ignore */ }
    }, 250);
  };

  // Create a new product from the current card — only on tap. The server checks
  // for a duplicate first; if one comes back (and we didn't force), offer it.
  const createNew = async (force: boolean) => {
    if (!current || creating) return;
    setCreating(true);
    try {
      const fd = new FormData();
      fd.append("name", current.name || current.heard);
      fd.append("brand", current.brand || "");
      fd.append("size", current.packSize || "");
      if (force) fd.append("force", "1");
      const r = await fetch("/admin/invoices/voice/create-product", { method: "POST", body: fd });
      const d = await r.json();
      if (d.duplicate && !force) { setDupe(d.duplicate); return; }
      if (d.created) adopt(d.created);
    } catch { /* ignore */ } finally {
      setCreating(false);
    }
  };

  // Read a phrase aloud (browser TTS). Resolves when done; no-op when muted.
  const speak = (text: string) =>
    new Promise<void>((resolve) => {
      if (!voiceOnRef.current || typeof window === "undefined" || !("speechSynthesis" in window) || !text) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = hasArabic(text) ? "ar-SA" : "en-US";
        u.rate = 1.05;
        const done = () => { speakingRef.current = false; resolve(); };
        u.onend = done;
        u.onerror = done;
        speakingRef.current = true; // echo-gate the live mic while speaking
        window.speechSynthesis.speak(u);
      } catch {
        speakingRef.current = false;
        resolve();
      }
    });

  // Run a spoken remove/edit command against the invoice lines. Returns true if
  // it consumed the utterance (a handler exists), even when nothing matched.
  const handleCommand = (cmd: Command): boolean => {
    if (cmd.kind === "remove") {
      if (!onRemoveLineRef.current) return false;
      const name = onRemoveLineRef.current(cmd.query);
      if (name) void speak(`Removed ${name}.`);
      else { setNote(`Couldn't find “${cmd.query}” to remove.`); void speak(`I couldn't find ${cmd.query}.`); }
      return true;
    }
    if (!onEditLineRef.current) return false;
    const name = onEditLineRef.current(cmd.query, cmd.n);
    if (name) void speak(`Set ${name} to ${cmd.n}.`);
    else { setNote(`Couldn't find “${cmd.query}”.`); void speak(`I couldn't find ${cmd.query}.`); }
    return true;
  };

  // Record a short answer and stop on silence (or after 7s); transcribe it.
  const listenForAnswer = async (): Promise<string> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return "";
    }
    return new Promise<string>((resolve) => {
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      let ac: AudioContext | null = null;
      let heardVoice = false;
      rec.onstop = async () => {
        stream.getTracks().forEach((tk) => tk.stop());
        try { await ac?.close(); } catch { /* ignore */ }
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (!blob.size || !heardVoice) { resolve(""); return; }
        try {
          const fd = new FormData();
          fd.append("audio", blob, "answer.webm");
          const r = await fetch("/admin/invoices/voice/transcribe", { method: "POST", body: fd });
          const d = await r.json();
          resolve(typeof d.text === "string" ? d.text : "");
        } catch {
          resolve("");
        }
      };
      try {
        ac = new AudioContext();
        const srcNode = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 512;
        srcNode.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const started = Date.now();
        let lastVoice = Date.now();
        const tick = () => {
          if (rec.state !== "recording") return;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) { const n = (v - 128) / 128; sum += n * n; }
          const rms = Math.sqrt(sum / data.length);
          const now = Date.now();
          if (rms > 0.035) { lastVoice = now; heardVoice = true; }
          if ((heardVoice && now - lastVoice > 1200) || now - started > 7000) { rec.stop(); return; }
          requestAnimationFrame(tick);
        };
        rec.start();
        requestAnimationFrame(tick);
      } catch {
        // No analyser → fall back to a fixed 4s window.
        heardVoice = true;
        rec.start();
        setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 4000);
      }
    });
  };

  // Transcribe one spoken utterance and append any items/customer it yields.
  const processLiveChunk = async (blob: Blob) => {
    if (!blob.size) return;
    try {
      const afd = new FormData();
      afd.append("audio", blob, "live.webm");
      const tRes = await fetch("/admin/invoices/voice/transcribe", { method: "POST", body: afd });
      const tData = await tRes.json();
      const text = typeof tData.text === "string" ? tData.text.trim() : "";
      if (!text) return;
      setLiveTranscript((prev) => (prev ? `${prev} ${text}` : text));

      // A remove/edit command mid-stream? Act on it instead of adding items.
      const cmd = parseCommand(text);
      if (cmd && handleCommand(cmd)) return;

      const mfd = new FormData();
      mfd.append("transcript", text);
      if (customerId) mfd.append("customerId", customerId);
      const mRes = await fetch("/admin/invoices/voice/match", { method: "POST", body: mfd });
      const mData = await mRes.json();
      const items: VoiceItem[] = clearDefaultReason(Array.isArray(mData.items) ? mData.items : []);
      if (items.length) setQueue((q) => [...q, ...items]);

      // Capture a detected customer, but don't open the confirm modal mid-stream
      // (confirming reloads the page). It's surfaced when the user taps Stop.
      if (mData.customer?.id && !liveCustomerRef.current && mData.customer.id !== customerId) {
        liveCustomerRef.current = {
          customer: { id: mData.customer.id, label: mData.customer.label },
          alts: Array.isArray(mData.customerAlternatives) ? mData.customerAlternatives : [],
          confident: mData.customerConfident !== false,
          heard: mData.heardCustomer || null,
        };
      }
    } catch {
      /* ignore a dropped utterance */
    }
  };

  const teardownLive = () => {
    try { liveStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { void liveAcRef.current?.close(); } catch { /* ignore */ }
    liveStreamRef.current = null;
    liveRecRef.current = null;
    liveAcRef.current = null;
  };

  const startLive = async () => {
    setNote(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNote("Couldn't access the microphone. Allow mic access and try again.");
      return;
    }
    liveStreamRef.current = stream;
    liveRef.current = true;
    setLive(true);
    setLiveTranscript("");
    setDone(false);
    liveCustomerRef.current = null;

    let ac: AudioContext | null = null;
    try { ac = new AudioContext(); } catch { ac = null; }
    liveAcRef.current = ac;
    const analyser = ac ? ac.createAnalyser() : null;
    if (ac && analyser) { analyser.fftSize = 512; ac.createMediaStreamSource(stream).connect(analyser); }
    const time = new Uint8Array(analyser ? analyser.fftSize : 0);
    const freq = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);

    let speechStarted = false;
    let lastVoice = Date.now();

    const startRec = () => {
      let chunks: Blob[] = [];
      speechStarted = false;
      const rec = new MediaRecorder(stream);
      liveRecRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        chunks = [];
        if (speechStarted) void processLiveChunk(blob);
        if (liveRef.current) startRec();
        else teardownLive();
      };
      rec.start();
    };
    startRec();

    const loop = () => {
      if (!liveRef.current) return;
      if (analyser) {
        analyser.getByteTimeDomainData(time);
        let sum = 0;
        for (const v of time) { const n = (v - 128) / 128; sum += n * n; }
        const rms = Math.sqrt(sum / time.length);
        const now = Date.now();
        if (rms > 0.045 && !speakingRef.current) { lastVoice = now; speechStarted = true; }
        // End of an utterance: speech, then ~800ms of silence → flush + restart.
        if (speechStarted && now - lastVoice > 800) {
          const rec = liveRecRef.current;
          if (rec && rec.state === "recording") rec.stop();
        }
        // Waveform.
        const c = canvasRef.current;
        const ctx = c?.getContext("2d");
        if (c && ctx) {
          analyser.getByteFrequencyData(freq);
          const w = c.width, h = c.height;
          ctx.clearRect(0, 0, w, h);
          const bars = 28;
          const step = Math.max(1, Math.floor(freq.length / bars));
          ctx.fillStyle = "#59652f";
          for (let i = 0; i < bars; i += 1) {
            const val = freq[i * step] / 255;
            const bh = Math.max(2, val * h);
            ctx.fillRect(i * (w / bars) + 1, (h - bh) / 2, w / bars - 2, bh);
          }
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const stopLive = () => {
    liveRef.current = false;
    setLive(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const rec = liveRecRef.current;
    if (rec && rec.state === "recording") { try { rec.stop(); } catch { teardownLive(); } }
    else teardownLive();

    // Now surface any customer heard during the stream (deferred to avoid a
    // mid-stream page reload).
    const c = liveCustomerRef.current;
    if (c && invoiceId && !pendingCustomer && !customerHandled && c.customer.id !== customerId) {
      setPendingCustomer(c.customer);
      setCustomerAlts(c.alts);
      setCustomerConfident(c.confident);
      setHeardCustomer(c.heard);
      setNewBusiness(c.heard || "");
      setCustMode("confirm");
    }
    liveCustomerRef.current = null;
  };

  // Stop the live session if the component unmounts.
  useEffect(() => () => { if (liveRef.current) { liveRef.current = false; teardownLive(); } }, []);

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

        // A remove/edit command? Act on it instead of adding items.
        const cmd = parseCommand(tData.text);
        if (cmd && handleCommand(cmd)) { setStatus("idle"); return; }

        setStatus("matching");
        const mfd = new FormData();
        mfd.append("transcript", tData.text);
        if (customerId) mfd.append("customerId", customerId);
        const mRes = await fetch("/admin/invoices/voice/match", { method: "POST", body: mfd });
        const mData = await mRes.json();
        if (mData.configured === false) { setNote("Matching needs an ANTHROPIC_API_KEY — add it under /developers."); setStatus("idle"); return; }
        setHeardCustomer(mData.heardCustomer || mData.customer?.label || null);
        setPendingCustomer(mData.customer?.id ? { id: mData.customer.id, label: mData.customer.label } : null);
        setCustomerAlts(Array.isArray(mData.customerAlternatives) ? mData.customerAlternatives : []);
        setCustomerConfident(mData.customerConfident !== false);
        setCustomerHandled(false);
        setCustMode("confirm");
        setNewBusiness(mData.heardCustomer || "");
        const items: VoiceItem[] = clearDefaultReason(Array.isArray(mData.items) ? mData.items : []);
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

  // Stash the in-progress queue so it resumes after the customer-assign reload.
  const stashQueue = (label: string | null) => {
    if (!invoiceId) return;
    try {
      sessionStorage.setItem(
        `voiceQueue:${invoiceId}`,
        JSON.stringify({ items: queue, transcript, confidence, heardCustomer: label }),
      );
    } catch { /* ignore */ }
  };

  // Assign an existing (or alternative) customer. Stash the queue, then full-page
  // POST (host-safe) to the customer route; the page reloads and we resume.
  const confirmPick = (pick: DetectedCustomer) => {
    if (!invoiceId) { setCustomerHandled(true); return; }
    stashQueue(pick.label);
    setAssignId(pick.id); // the hidden existing-form reads this
    setTimeout(() => custFormRef.current?.submit(), 0);
  };

  const keepCurrent = () => setCustomerHandled(true);

  // Create a new customer from the quick-add form, then continue the order.
  const submitNewCustomer = () => {
    stashQueue(newBusiness.trim() || heardCustomer);
    setTimeout(() => newFormRef.current?.submit(), 0);
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
      void speak(yes ? "Added." : "Skipped.");
      setTally((t) => ({ added: t.added + (yes ? 1 : 0), skipped: t.skipped + (yes ? 0 : 1) }));
      setQueue((qq) => { const rest = qq.slice(1); if (rest.length === 0) setDone(true); return rest; });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, qty, reason, onAddLine],
  );

  // Desktop shortcuts: Enter = Yes, Esc = No, while an item card is showing.
  useEffect(() => {
    if (!current || askingCustomer || live) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); answer(true); }
      else if (e.key === "Escape") { e.preventDefault(); answer(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [current, askingCustomer, answer, live]);

  // Speak each card as it comes to the front (TTS). Re-speaks when the content
  // changes (e.g. after switching to an alternative).
  useEffect(() => {
    if (!current || askingCustomer || live) return;
    const phrase = cardPhrase(current);
    if (phrase === lastSpokenRef.current) return;
    lastSpokenRef.current = phrase;
    void speak(phrase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, askingCustomer, live]);

  // Tap-to-answer: record a short reply, transcribe, and act on it.
  const answerByVoice = async () => {
    if (!current || answering) return;
    setAnswering(true);
    try {
      const text = await listenForAnswer();
      // A credit still missing its reason? Try to hear one.
      if (current.isCredit && !(current.creditReason || reason)) {
        const r = parseReason(text);
        if (r) { setReason(r); void speak(`${r}.`); return; }
      }
      // A remove/edit command?
      const cmd = parseCommand(text);
      if (cmd && handleCommand(cmd)) return;

      const a = parseAnswer(text);
      if (a.kind === "yes") answer(true);
      else if (a.kind === "no") answer(false);
      else if (a.kind === "select") { const alt = current.alternatives?.[a.n - 1]; if (alt) adopt(alt); }
      else if (a.kind === "qty") setQty(String(a.n));
      else void speak("Sorry, I didn't catch that.");
    } finally {
      setAnswering(false);
    }
  };

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
      <span className="inline-flex items-center gap-1">
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
        <button
          type="button"
          onClick={live ? stopLive : startLive}
          aria-pressed={live}
          disabled={recording || busy}
          title="Live listening — one tap to start, one tap to stop"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
            live ? "border-red-400 bg-red-600 text-white hover:bg-red-700" : "border-olive-300 bg-white text-olive-800 hover:bg-olive-50"
          }`}
        >
          {live ? <Square className="h-4 w-4" /> : <Radio className="h-4 w-4" />} {live ? "Stop" : "Live"}
        </button>
        <button
          type="button"
          onClick={toggleVoice}
          aria-pressed={voiceOn}
          title={voiceOn ? "Spoken replies on — tap to mute" : "Spoken replies off — tap to unmute"}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
            voiceOn ? "border-olive-300 bg-white text-olive-700 hover:bg-olive-50" : "border-olive-200 bg-olive-50 text-olive-400"
          }`}
        >
          {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </span>

      {/* Live listening bar — waveform + running transcript + Stop. */}
      {live ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-olive-200 bg-white/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-red-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Live
            </span>
            <canvas ref={canvasRef} width={240} height={36} className="h-9 flex-1 rounded bg-olive-50" />
            <span className="shrink-0 text-xs font-medium text-olive-700">{queue.length} item{queue.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={stopLive} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-olive-900 px-3 py-2 text-sm font-medium text-white hover:bg-olive-800">
              <Square className="h-4 w-4" /> Stop &amp; review
            </button>
          </div>
          {queue.length ? (
            <div className="mx-auto mt-1.5 flex max-w-2xl flex-wrap gap-1.5">
              {queue.slice(-5).map((it, i) => (
                <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] ${it.isCredit ? "bg-amber-100 text-amber-800" : "bg-olive-100 text-olive-700"}`}>
                  {it.quantitySpoken ? `${it.quantity}× ` : ""}{it.name || it.heard}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mx-auto mt-1.5 max-w-2xl truncate text-xs text-olive-400">
            {liveTranscript || "Listening… say the customer and items — they appear here as you talk."}
          </p>
        </div>
      ) : null}
      {note ? <p className="mt-1 w-full text-right text-xs text-olive-500">{note}</p> : null}

      {/* Hidden form that assigns an existing/alternative customer (POST → reload). */}
      {invoiceId ? (
        <form ref={custFormRef} method="post" action={`/admin/invoices/${invoiceId}/customer`} className="hidden">
          <input type="hidden" name="mode" value="existing" />
          <input type="hidden" name="customerId" value={assignId} />
        </form>
      ) : null}

      {/* Step 1 — confirm the heard customer (with alternatives), or add a new one. */}
      {askingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            {custMode === "confirm" && pendingCustomer ? (
              <>
                <div className="flex items-center gap-2 text-olive-500">
                  <UserCheck className="h-5 w-5 text-olive-600" />
                  <span className="text-xs font-medium">{customerId ? "Change the customer?" : "I heard a customer"}</span>
                </div>
                <p className="mt-2 text-sm text-olive-700">
                  {customerConfident ? (customerId ? "Change this invoice to" : "Make this invoice for") : "Closest match —"}
                </p>
                <p className="font-display text-xl text-olive-900">{pendingCustomer.label}?</p>
                {heardCustomer && heardCustomer !== pendingCustomer.label ? (
                  <p className="mt-1 text-xs text-olive-400">You said: &ldquo;{heardCustomer}&rdquo;</p>
                ) : null}
                {customerId ? <p className="mt-1 text-xs text-amber-600">This invoice already has a customer — this replaces it.</p> : null}
                {queue.length ? <p className="mt-2 text-xs text-olive-500">Then I&apos;ll go through {queue.length} item{queue.length === 1 ? "" : "s"}.</p> : null}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => confirmPick(pendingCustomer)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-olive-900 py-3 text-base font-semibold text-white hover:bg-olive-800">
                    <Check className="h-5 w-5" /> {customerId ? "Yes, change" : "Yes, set them"}
                  </button>
                  <button type="button" onClick={keepCurrent} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-olive-200 py-3 text-base font-semibold text-olive-700 hover:bg-olive-50">
                    <X className="h-5 w-5" /> {customerId ? "Keep current" : "Skip"}
                  </button>
                </div>
                {customerAlts.length ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-olive-500">or did you mean:</p>
                    <div className="space-y-1.5">
                      {customerAlts.map((a) => (
                        <button key={a.id} type="button" onClick={() => confirmPick(a)} className="block w-full rounded-lg border border-olive-100 bg-white px-3 py-2 text-left text-sm text-olive-800 hover:border-olive-300">
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <button type="button" onClick={() => setCustMode("new")} className="mt-3 w-full text-center text-xs font-medium text-olive-600 underline underline-offset-2 hover:text-olive-900">
                  None of these — add a new customer
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-olive-500">
                  <UserPlus className="h-5 w-5 text-olive-600" />
                  <span className="text-xs font-medium">Add a customer</span>
                </div>
                {heardCustomer ? <p className="mt-2 text-xs text-olive-500">Couldn&apos;t find &ldquo;{heardCustomer}&rdquo;. Add them?</p> : null}
                <form ref={newFormRef} method="post" action={`/admin/invoices/${invoiceId}/customer`} onSubmit={(e) => { e.preventDefault(); submitNewCustomer(); }} className="mt-2 space-y-2">
                  <input type="hidden" name="mode" value="new" />
                  <div>
                    <label className="mb-0.5 block text-[11px] text-olive-500">Business name</label>
                    <input name="businessName" value={newBusiness} onChange={(e) => setNewBusiness(e.target.value)} autoFocus className={ciCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="mb-0.5 block text-[11px] text-olive-500">Contact</label><input name="name" placeholder="Optional" className={ciCls} /></div>
                    <div><label className="mb-0.5 block text-[11px] text-olive-500">Phone</label><input name="phone" inputMode="tel" placeholder="Optional" className={ciCls} /></div>
                  </div>
                  <div><label className="mb-0.5 block text-[11px] text-olive-500">Address</label><input name="street" placeholder="Optional" className={ciCls} /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <input name="city" placeholder="City" className={ciCls} />
                    <input name="state" placeholder="State" className={ciCls} />
                    <input name="zip" placeholder="ZIP" className={ciCls} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={!newBusiness.trim()} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-olive-900 py-2.5 text-sm font-semibold text-white hover:bg-olive-800 disabled:opacity-50">
                      <Check className="h-4 w-4" /> Create &amp; use
                    </button>
                    {pendingCustomer ? (
                      <button type="button" onClick={() => setCustMode("confirm")} className="rounded-xl border border-olive-200 px-3 py-2.5 text-sm font-semibold text-olive-700 hover:bg-olive-50">Back</button>
                    ) : (
                      <button type="button" onClick={keepCurrent} className="rounded-xl border border-olive-200 px-3 py-2.5 text-sm font-semibold text-olive-700 hover:bg-olive-50">Skip</button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Step 2 — item cards, one at a time (suppressed while live; reviewed after Stop) */}
      {current && !askingCustomer && !live ? (
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

            {/* Change match — alternatives, catalog search, or create new (on tap). */}
            {!isCredit ? (
              <div className="mt-3">
                <button type="button" onClick={() => setChanging((v) => !v)} className="text-xs font-medium text-olive-600 underline underline-offset-2 hover:text-olive-900">
                  {current.matchTag === "matched" ? "Not the right item? Change" : "Find or create the right item"}
                </button>

                {changing ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-olive-100 bg-olive-50/50 p-2">
                    {dupe ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                        <p className="text-xs text-amber-800">
                          Looks like <span className="font-semibold">{dupe.name}</span>{dupe.packSize ? ` · ${dupe.packSize}` : ""} already exists — use it?
                        </p>
                        <div className="mt-1.5 flex gap-1.5">
                          <button type="button" onClick={() => adopt(dupe)} className="rounded-lg bg-olive-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-olive-800">Use it</button>
                          <button type="button" onClick={() => createNew(true)} disabled={creating} className="rounded-lg border border-olive-300 px-2.5 py-1 text-xs font-medium text-olive-700 hover:bg-white disabled:opacity-60">Create anyway</button>
                          <button type="button" onClick={() => setDupe(null)} className="rounded-lg px-2 py-1 text-xs text-olive-500 hover:text-olive-800">Back</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {(current.alternatives?.length ? current.alternatives : []).map((a) => (
                          <HitButton key={`alt-${a.sku}`} hit={a} onPick={adopt} />
                        ))}
                        <input
                          value={searchQ}
                          onChange={(e) => runSearch(e.target.value)}
                          placeholder="Search the catalog…"
                          className="h-9 w-full rounded-lg border border-olive-200 px-2.5 text-sm focus:border-olive-500 focus:outline-none"
                        />
                        {results.map((a) => <HitButton key={`res-${a.sku}`} hit={a} onPick={adopt} />)}
                        {current.alternatives?.length === 0 && results.length === 0 && searchQ.trim().length >= 2 ? (
                          <p className="px-1 text-[11px] text-olive-400">No catalog matches.</p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => createNew(false)}
                          disabled={creating}
                          className="w-full rounded-lg border border-dashed border-olive-300 px-2 py-2 text-xs font-medium text-olive-700 hover:bg-white disabled:opacity-60"
                        >
                          {creating ? "Creating…" : `+ Create “${current.name || current.heard}” as a new product`}
                        </button>
                        <p className="px-1 text-[10px] text-olive-400">New products are saved hidden and flagged “Needs review” for later approval.</p>
                      </>
                    )}
                  </div>
                ) : null}
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
            <button
              type="button"
              onClick={answerByVoice}
              disabled={answering}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-olive-300 bg-white py-2.5 text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-60"
            >
              {answering ? (
                <><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Listening…</>
              ) : (
                <><Mic className="h-4 w-4" /> Answer by voice</>
              )}
            </button>
            <p className="mt-2 text-center text-[11px] text-olive-400">
              {answering
                ? "Say “yes”, “no”, “the second one”, or “make it 3”"
                : qtyNum < 1 ? "Enter a quantity to add this item" : isCredit && !effReason ? "Pick a reason to add this credit" : "Enter = Yes · Esc = Skip"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Summary after the last card */}
      {done && !current && !askingCustomer && !live ? (
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

// One catalog product as a tappable row in the "change match" panel.
function HitButton({ hit, onPick }: { hit: CatalogHit; onPick: (h: CatalogHit) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(hit)}
      className="flex w-full items-center gap-2 rounded-lg border border-olive-100 bg-white px-2 py-1.5 text-left hover:border-olive-300"
    >
      {hit.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={hit.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-8 w-8 shrink-0 rounded bg-olive-100" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-olive-900">{hit.name}</span>
        <span className="block truncate text-[11px] text-olive-500">
          {[hit.brand, hit.packSize].filter(Boolean).join(" · ") || "—"} · {money(hit.priceCents)}
        </span>
      </span>
    </button>
  );
}
