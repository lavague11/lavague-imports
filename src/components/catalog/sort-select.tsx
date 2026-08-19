"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "name", label: "Name (A–Z)" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

/** Sort control — navigates on change, preserving the other filters. */
export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "featured") params.delete("sort");
    else params.set("sort", next);
    params.delete("show");
    router.push(`/shop?${params.toString()}`);
  }

  return (
    <select
      aria-label="Sort products"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 rounded-full border border-olive-200 px-4 text-sm text-olive-900 focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          Sort: {o.label}
        </option>
      ))}
    </select>
  );
}
