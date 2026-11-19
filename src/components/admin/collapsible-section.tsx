"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// A titled section that collapses to a one-line summary. Used for Payments and
// Delivery on the invoice screen (DASHBOARD redesign #9): tap the header to
// expand. `defaultOpen` is forced true when a required action is still missing
// (e.g. an unpaid balance or an undelivered order) so nothing important hides.
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  tone = "default",
  children,
}: {
  title: string;
  summary: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "good";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`overflow-hidden rounded-xl border bg-white ${tone === "good" ? "border-emerald-200" : "border-olive-100"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="font-display text-base text-olive-900">{title}</span>
        <span className="ml-auto flex min-w-0 items-center gap-2 text-sm text-olive-600">
          {!open ? <span className="truncate">{summary}</span> : null}
          <ChevronDown className={`h-4 w-4 shrink-0 text-olive-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      <div className={`${open ? "block" : "hidden"} border-t border-olive-100 p-4`}>{children}</div>
    </div>
  );
}
