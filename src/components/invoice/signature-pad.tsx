"use client";

import { useEffect, useRef, useState } from "react";

/**
 * In-app e-signature: a typed name plus an optional drawn signature, posted to
 * the sign route as a PNG data-URL. No external service.
 */
export function SignatureForm({ action, defaultName = "" }: { action: string; defaultName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [name, setName] = useState(defaultName);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#2f3320";
      }
    };
    resize();
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    const canvas = canvasRef.current;
    if (canvas && hiddenRef.current && drawn) {
      try {
        hiddenRef.current.value = canvas.toDataURL("image/png");
      } catch {
        /* tainted canvas — fall back to typed name only */
      }
    }
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn(false);
    if (hiddenRef.current) hiddenRef.current.value = "";
  };

  return (
    <form method="post" action={action} className="space-y-4">
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
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-olive-600">Signature</label>
          <button type="button" onClick={clear} className="text-xs text-olive-500 hover:text-olive-800">Clear</button>
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="mt-1 h-36 w-full touch-none rounded-lg border border-dashed border-olive-300 bg-white"
        />
        <input ref={hiddenRef} type="hidden" name="signatureData" />
        <p className="mt-1 text-xs text-olive-400">Draw above with your mouse or finger. The typed name is sufficient on its own.</p>
      </div>
      <button
        type="submit"
        disabled={!name.trim()}
        className="w-full rounded-lg bg-olive-900 px-5 py-3 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50"
      >
        Accept this invoice
      </button>
    </form>
  );
}
