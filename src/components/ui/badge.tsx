import { cn } from "@/lib/utils";

/**
 * Renders a product's freeform source ribbon (e.g. "Best Seller", "HOT ITEM",
 * "Only 2 Left"). Known ribbons get a tuned colour; anything else falls back to
 * the neutral olive treatment so new ribbon text still renders sensibly.
 */
function toneFor(ribbon: string): string {
  const key = ribbon.trim().toLowerCase();
  if (/(hot|best\s?seller|top rated)/.test(key)) return "bg-olive-900 text-white";
  if (/(almost gone|only \d+ left|last|low stock)/.test(key))
    return "bg-amber-100 text-amber-900";
  if (/(sale|off|deal)/.test(key)) return "bg-white text-olive-800 ring-1 ring-olive-300";
  if (/(new)/.test(key)) return "bg-olive-100 text-olive-800";
  return "bg-olive-100 text-olive-800";
}

export function Badge({
  ribbon,
  className,
}: {
  ribbon: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase",
        toneFor(ribbon),
        className,
      )}
    >
      {ribbon}
    </span>
  );
}
