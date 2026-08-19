"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Flag } from "@/components/ui/flag";

interface Suggestions {
  products: { name: string; slug: string }[];
  countries: { name: string; slug: string; count: number }[];
}

const EMPTY: Suggestions = { products: [], countries: [] };

/** Shop search with live typeahead suggestions (products + countries). Full-text
 *  search still works via Enter / the Search button, preserving other filters. */
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [sugg, setSugg] = useState<Suggestions>(EMPTY);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Debounced suggestion fetch. All state updates happen inside the timeout
  // (deferred), never synchronously during the effect.
  useEffect(() => {
    const term = q.trim();
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setSugg(EMPTY);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) {
          setSugg(await res.json());
          setOpen(true);
        }
      } catch {
        /* aborted or offline */
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close on outside click / Escape.
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

  function withParams(mutate: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("show");
    mutate(p);
    setOpen(false);
    router.push(`/shop?${p.toString()}`);
  }

  const submitSearch = (term = q) =>
    withParams((p) => {
      const t = term.trim();
      if (t) p.set("q", t);
      else p.delete("q");
    });

  const chooseCountry = (slug: string) => withParams((p) => p.set("country", slug));

  const hasResults = sugg.products.length > 0 || sugg.countries.length > 0;

  return (
    <div ref={ref} className="relative mt-4 lg:mt-0">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
        <label className="sr-only" htmlFor="q">Search products or country</label>
        <input
          id="q"
          name="q"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hasResults && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitSearch();
            }
          }}
          placeholder="Search products or country…"
          className="h-10 w-full rounded-full border border-olive-200 pr-[4.5rem] pl-9 text-sm text-olive-900 placeholder:text-olive-400 focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none sm:h-11"
        />
        <button
          type="button"
          onClick={() => submitSearch()}
          className="absolute top-1/2 right-1.5 h-7 -translate-y-1/2 rounded-full bg-olive-900 px-3.5 text-xs font-medium text-white hover:bg-olive-800 sm:h-8 sm:px-4"
        >
          Search
        </button>
      </div>

      {open && hasResults ? (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-2xl border border-olive-100 bg-white py-1 shadow-lg shadow-olive-900/5">
          {sugg.countries.map((c) => (
            <li key={`c-${c.slug}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseCountry(c.slug)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-olive-800 hover:bg-olive-50"
              >
                <Flag country={c.name} className="w-4" />
                <span className="font-medium">{c.name}</span>
                <span className="text-olive-400">· {c.count} items</span>
              </button>
            </li>
          ))}
          {sugg.products.map((p) => (
            <li key={`p-${p.slug}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => router.push(`/shop/${p.slug}`)}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-olive-800 hover:bg-olive-50"
              >
                <span className="line-clamp-1">{p.name}</span>
              </button>
            </li>
          ))}
          <li className="border-t border-olive-50">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submitSearch()}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-olive-700 hover:bg-olive-50"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Search for “{q.trim()}”
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
