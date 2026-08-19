import { cn } from "@/lib/utils";

const controlClasses =
  "w-full rounded-lg border border-olive-200 bg-white px-3.5 py-2.5 text-sm text-olive-900 placeholder:text-olive-400 transition-colors hover:border-olive-300 focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-200 disabled:bg-olive-50";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-olive-800"
      >
        {label}
        {required ? <span className="text-olive-500"> *</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-olive-500">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-red-700">{error}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea className={cn(controlClasses, "min-h-28", className)} {...props} />
  );
}

export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return <select className={cn(controlClasses, "pr-8", className)} {...props} />;
}
