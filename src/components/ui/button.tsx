import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-olive-900 text-white hover:bg-olive-800 active:bg-olive-950 disabled:hover:bg-olive-900",
  secondary:
    "border border-olive-300 bg-white text-olive-900 hover:border-olive-500 hover:bg-olive-50",
  ghost: "text-olive-800 hover:bg-olive-50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

/** Shared button styling, so `<Link>` and `<button>` can look identical. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button className={buttonClasses({ variant, size, className })} {...props} />
  );
}
