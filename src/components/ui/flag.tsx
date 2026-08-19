import { isoFor } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A real flag image (from flagcdn.com) rather than an emoji, since emoji flags
 * don't render on Windows/Chrome. Loaded directly (not via next/image) so no
 * optimizer/host config is needed; sizing is controlled with `className`.
 */
export function Flag({
  country,
  className,
}: {
  country: string | null | undefined;
  className?: string;
}) {
  const iso = isoFor(country);
  if (!iso) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w80/${iso}.png`}
      alt={`${country} flag`}
      loading="lazy"
      className={cn(
        "inline-block h-auto shrink-0 rounded-[2px] ring-1 ring-black/5",
        className,
      )}
    />
  );
}
