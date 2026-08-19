import { cn } from "@/lib/utils";

/**
 * Brand mark: an olive branch with a single fruit, matching the logo.
 * `currentColor` drives the branch so the mark can sit on light or dark ground.
 */
export function OliveMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 46 30"
      fill="none"
      aria-hidden="true"
      className={cn("h-7 w-auto", className)}
    >
      <path
        d="M1.6 13.4c6.2-5.6 14.4-7.4 24.6-5.6-6.6 6.2-15.1 8.1-24.6 5.6Z"
        fill="currentColor"
      />
      <path
        d="M25.4 7.9c4.2 2.4 7.3 5.1 9.3 8.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <ellipse cx="35.6" cy="21.3" rx="6.4" ry="8.2" fill="#9caf7b" />
      <ellipse
        cx="35.6"
        cy="21.3"
        rx="6.4"
        ry="8.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * Wordmark. Swap this for the supplied artwork by replacing the markup with
 * `<Image src="/logo.png" alt="La Vague Imports" width={220} height={96} />`.
 */
export function Logo({
  className,
  layout = "inline",
}: {
  className?: string;
  layout?: "inline" | "stacked";
}) {
  if (layout === "stacked") {
    return (
      <span className={cn("inline-flex flex-col text-olive-900", className)}>
        <span className="font-display text-3xl leading-none">La Vague</span>
        <span className="flex items-center gap-2">
          <span className="font-display text-3xl leading-none">Imports</span>
          <OliveMark className="h-6" />
        </span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5 text-olive-900", className)}>
      <OliveMark className="h-6 shrink-0" />
      <span className="font-display text-xl leading-none tracking-tight sm:text-2xl">
        La Vague <span className="text-olive-600">Imports</span>
      </span>
    </span>
  );
}
