"use client";

import { useState } from "react";

import { Flag } from "@/components/ui/flag";

interface Country { slug: string; name: string; count: number }
interface Category { slug: string; name: string }

const boxLabel =
  "flex cursor-pointer items-center gap-2 rounded-lg border border-olive-200 px-3 py-2 text-sm text-olive-800 transition-colors hover:border-olive-400 has-[:checked]:border-olive-700 has-[:checked]:bg-olive-50";

function Toggle({ allOn, onClick }: { allOn: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-olive-300 px-3 py-1 text-xs font-medium text-olive-700 hover:border-olive-500 hover:bg-olive-50"
    >
      {allOn ? "Clear all" : "Select all"}
    </button>
  );
}

export function CatalogBuilder({ countries, categories }: { countries: Country[]; categories: Category[] }) {
  const [selCountries, setSelCountries] = useState<Set<string>>(new Set());
  const [selCats, setSelCats] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, val: string) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  const allCountries = selCountries.size === countries.length;
  const allCats = selCats.size === categories.length;

  return (
    <form action="/catalog/generate" method="get" className="space-y-9">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-olive-900">Countries</h2>
          <Toggle allOn={allCountries} onClick={() => setSelCountries(allCountries ? new Set() : new Set(countries.map((c) => c.slug)))} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {countries.map((c) => (
            <label key={c.slug} className={boxLabel}>
              <input
                type="checkbox"
                name="countries"
                value={c.slug}
                checked={selCountries.has(c.slug)}
                onChange={() => setSelCountries((s) => toggle(s, c.slug))}
                className="h-4 w-4 accent-olive-800"
              />
              <Flag country={c.name} className="w-5" />
              <span className="truncate">{c.name}</span>
              <span className="ml-auto text-xs text-olive-400">{c.count}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-olive-900">Categories</h2>
          <Toggle allOn={allCats} onClick={() => setSelCats(allCats ? new Set() : new Set(categories.map((c) => c.slug)))} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((c) => (
            <label key={c.slug} className={boxLabel}>
              <input
                type="checkbox"
                name="categories"
                value={c.slug}
                checked={selCats.has(c.slug)}
                onChange={() => setSelCats((s) => toggle(s, c.slug))}
                className="h-4 w-4 accent-olive-800"
              />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl text-olive-900">Organize by</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={boxLabel}>
            <input type="radio" name="sort" value="country" defaultChecked className="h-4 w-4 accent-olive-800" />
            Country
          </label>
          <label className={boxLabel}>
            <input type="radio" name="sort" value="category" className="h-4 w-4 accent-olive-800" />
            Category
          </label>
        </div>
      </section>

      <div className="flex flex-col items-start gap-3 border-t border-olive-100 pt-8 sm:flex-row sm:items-center">
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center rounded-full bg-olive-900 px-8 text-sm font-medium text-white hover:bg-olive-800"
        >
          Download catalog
        </button>
        <p className="text-sm text-olive-500">
          Nothing selected downloads everything. Large selections take a few seconds.
        </p>
      </div>
    </form>
  );
}
