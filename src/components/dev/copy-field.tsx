"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A read-only value with a copy button — for redirect URIs, env names, URLs. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  return (
    <div>
      {label ? <p className="mb-1 text-xs font-medium text-olive-600">{label}</p> : null}
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-olive-100 bg-olive-50/60 px-3 py-2 text-xs text-olive-900">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-olive-200 bg-white px-3 text-xs font-medium text-olive-700 hover:bg-olive-50"
          aria-label="Copy to clipboard"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
