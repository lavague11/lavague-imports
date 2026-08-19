import { BadgeCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/** Shown on every Meat & Poultry product — the range is 100% zabiha halal. */
export function HalalBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm",
        className,
      )}
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      100% Zabiha Halal
    </span>
  );
}
