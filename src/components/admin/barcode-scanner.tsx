"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

// Camera barcode scanner modal (EAN-13 / UPC). Uses ZXing over getUserMedia so
// it works on a laptop or phone camera. A USB barcode scanner doesn't need this
// — it types digits into the focused barcode field instead (handled in the form).

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]);

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, ctrl) => {
        controls = ctrl;
        if (stopped) {
          ctrl.stop();
          return;
        }
        if (result) {
          const text = result.getText().replace(/[^0-9]/g, "");
          if (text.length >= 6) {
            stopped = true;
            ctrl.stop();
            onDetected(text);
          }
        }
      })
      .catch((e) => {
        console.error("[scanner] camera failed", e);
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission was blocked. Allow camera access, or use a USB scanner / type the barcode."
            : "Couldn't start the camera. Use a USB scanner or type the barcode instead.",
        );
      });

    return () => {
      stopped = true;
      try {
        controls?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
          <h3 className="font-display text-lg text-olive-900">Scan a barcode</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-olive-400 hover:text-olive-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {!error ? (
            <>
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500" />
            </>
          ) : null}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{error}</div>
          ) : null}
        </div>
        <p className="px-4 py-3 text-xs text-olive-500">
          Point the camera at an EAN-13 or UPC barcode. It captures automatically. A USB scanner works too — just click the barcode field and scan.
        </p>
      </div>
    </div>
  );
}
