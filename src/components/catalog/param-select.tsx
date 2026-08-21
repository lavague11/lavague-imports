"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/** A native <select> that sets a URL search param on change (preserving the
 *  rest) and navigates — no Apply button needed. */
export function ParamSelect({
  param,
  value,
  placeholder,
  options,
  className,
}: {
  param: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(param, next);
    else params.delete(param);
    params.delete("show");
    router.push(`/shop?${params.toString()}`);
  }

  return (
    <select
      aria-label={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-11 rounded-full border border-olive-200 px-4 text-sm text-olive-900 focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none",
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
