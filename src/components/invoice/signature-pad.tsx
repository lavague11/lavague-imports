"use client";

import { useEffect, useRef, useState } from "react";

const SIG_FONT = '"Dancing Script"';
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap";

/** Render a name as a scripted signature PNG (DocuSign-style "adopt"). */
function nameToSignaturePng(name: string): string | null {
  const text = name.trim();
  if (!text) return null;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = 600 * scale;
  canvas.height = 150 * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#1e2a16";
  ctx.textBaseline = "middle";
  let size = 70;
  ctx.font = `600 ${size}px ${SIG_FONT}, cursive`;
  while (ctx.measureText(text).width > 560 && size > 22) {
    size -= 2;
    ctx.font = `600 ${size}px ${SIG_FONT}, cursive`;
  }
  ctx.fillText(text, 12, 78);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * DocuSign-style signing: the name is autofilled and shown as a scripted
 * signature; one tap on "Sign & accept" adopts it. "Draw it instead" reveals a
 * canvas for a hand-drawn signature. Submits signerName + a signature PNG.
 */
export function SignatureForm({ action, defaultName = "" }: { action: string; defaultName?: string }) {
  const [name, setName] = useState(defaultName);
  const [fontReady, setFontReady] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Load the signature font so the adopted signature renders consistently.
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONT_HREF;
      document.head.appendChild(l);
    }
    let cancelled = false;
    (async () => {
      try {
        await (document as unknown as { fonts?: { load: (f: string) => Promise<unknown> } }).fonts?.load(`600 48px ${SIG_FONT}`);
      } catch {
        /* fall back to the generic cursive family */
      }
      if (!cancelled) setFontReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Canvas drawing (only used in "draw it instead" mode).
  useEffect(() => {
    if (!drawMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#2f3320";
    }
  }, [drawMode]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!drawn) setDrawn(true);
  };
  const end = () => {
    drawing.current = false;
    last.current = null;
    if (canvasRef.current && hiddenRef.current && drawn) {
      try {
        hiddenRef.current.value = canvasRef.current.toDataURL("image/png");
      } catch {
        /* ignore */
      }
    }
  };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn(false);
    if (hiddenRef.current) hiddenRef.current.value = "";
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!name.trim()) {
      e.preventDefault();
      return;
    }
    // In adopt mode, generate the scripted signature from the name on submit.
    if (!drawMode && hiddenRef.current) {
      const png = nameToSignaturePng(name);
      if (png) hiddenRef.current.value = png;
    }
    // In draw mode the hidden value is already set by the canvas (or empty →
    // the server falls back to the typed name).
  };

  return (
    <form method="post" action={action} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-olive-600">Your name</label>
        <input
          name="signerName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Full name"
          className="mt-1 h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none"
        />
      </div>

      {!drawMode ? (
        <div>
          <p className="text-xs font-medium text-olive-600">Your signature</p>
          <div className="mt-1 flex h-24 items-end rounded-lg border border-olive-200 bg-white px-4 pb-2">
            <span
              className="w-full truncate border-b border-olive-200 pb-1 text-4xl leading-none text-olive-900"
              style={{ fontFamily: fontReady ? `${SIG_FONT}, cursive` : "cursive" }}
            >
              {name.trim() || "Your name"}
            </span>
          </div>
          <button type="button" onClick={() => setDrawMode(true)} className="mt-1 text-xs text-olive-500 underline hover:text-olive-800">
            Draw it instead
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-olive-600">Draw your signature</p>
            <div className="flex gap-3 text-xs">
              <button type="button" onClick={clearCanvas} className="text-olive-500 hover:text-olive-800">Clear</button>
              <button type="button" onClick={() => { clearCanvas(); setDrawMode(false); }} className="text-olive-500 underline hover:text-olive-800">Type instead</button>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="mt-1 h-28 w-full touch-none rounded-lg border border-dashed border-olive-300 bg-white"
          />
        </div>
      )}

      <input ref={hiddenRef} type="hidden" name="signatureData" />

      <button
        type="submit"
        disabled={!name.trim()}
        className="w-full rounded-lg bg-olive-900 px-5 py-3 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50"
      >
        Sign &amp; accept
      </button>
      <p className="text-center text-xs text-olive-400">By tapping Sign &amp; accept you agree this is your electronic signature.</p>
    </form>
  );
}
