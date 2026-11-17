"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Shows a shareable link and copies the absolute URL to the clipboard. */
export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is still selectable */
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={path}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 w-full rounded-lg border border-olive-200 bg-olive-50/50 px-3 text-xs text-olive-700 focus:outline-none"
      />
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-olive-200 px-3 py-2 text-xs font-medium text-olive-700 hover:bg-olive-50"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
