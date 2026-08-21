"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isoFor } from "@/lib/countries";
import { cn } from "@/lib/utils";

interface Country {
  name: string;
  slug: string;
  count: number;
}

function Flag({ name }: { name: string }) {
  const iso = isoFor(name);
  if (!iso) return <span className="text-sm">🌍</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://flagcdn.com/w40/${iso}.png`} alt="" className="h-3.5 w-5 shrink-0 rounded-[1px] object-cover ring-1 ring-black/5" />
  );
}

/** Country filter with real flag images (native <option> can't show images). */
export function CountrySelect({
  selected,
  countries,
  className,
}: {
  selected: string | null;
  countries: Country[];
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function choose(slug: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set("country", slug);
    else params.delete("country");
    params.delete("show");
    setOpen(false);
    router.push(`/shop?${params.toString()}`);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2 rounded-full border border-olive-200 px-3 text-sm text-olive-900 hover:border-olive-400 focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none sm:min-w-[11rem] sm:px-4"
      >
        {selected ? <Flag name={selected} /> : <span aria-hidden="true">🌍</span>}
        <span className="truncate">{selected ?? "All countries"}</span>
        <span className="ml-auto text-olive-400">▾</span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="scrollbar-none absolute z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border border-olive-100 bg-white p-1 shadow-xl"
        >
          <button
            type="button"
            onClick={() => choose(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-olive-50",
              !selected && "bg-olive-50 font-medium",
            )}
          >
            <span aria-hidden="true">🌍</span> All countries
          </button>
          {countries.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => choose(c.slug)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-olive-50",
                selected === c.name && "bg-olive-50 font-medium",
              )}
            >
              <Flag name={c.name} />
              <span className="truncate">{c.name}</span>
              <span className="ml-auto text-xs text-olive-400">{c.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
