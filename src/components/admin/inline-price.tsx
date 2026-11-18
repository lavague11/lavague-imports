"use client";

import { useRef, useState } from "react";

/**
 * Desktop inline price editor (PRODUCTS_UI §10). Edits one product's primary
 * variant price in the list row: Enter or blur saves (as a draft override), a
 * 5-second Undo toast lets you revert, no confirm dialogs.
 */
export function InlinePrice({ slug, sku, initialDollars }: { slug: string; sku: string; initialDollars: string }) {
  const [value, setValue] = useState(initialDollars);
  const committed = useRef(initialDollars);
  const [saving, setSaving] = useState(false);
  const [undoPrev, setUndoPrev] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (next: string, prevForUndo: string | null) => {
    if (!sku) return;
    const norm = next.trim();
    setSaving(true);
    try {
      const res = await fetch(`/admin/products/${encodeURIComponent(slug)}/price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku, price: norm }),
      });
      if (!res.ok) throw new Error("save failed");
      committed.current = norm;
      setValue(norm);
      if (prevForUndo != null && prevForUndo.trim() !== norm) {
        setUndoPrev(prevForUndo);
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setUndoPrev(null), 5000);
      }
    } catch {
      setValue(committed.current); // revert the field on failure
    } finally {
      setSaving(false);
    }
  };

  const commit = () => {
    if (value.trim() === committed.current.trim()) return;
    void save(value, committed.current);
  };

  const doUndo = () => {
    const prev = undoPrev ?? committed.current;
    setUndoPrev(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    void save(prev, null);
  };

  return (
    <div className="relative inline-flex items-center justify-end gap-0.5">
      <span className="text-olive-400">$</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={commit}
        inputMode="decimal"
        placeholder="On request"
        aria-label="Price each"
        className={`h-8 w-24 rounded border border-transparent px-1.5 text-right text-sm hover:border-olive-200 focus:border-olive-500 focus:outline-none placeholder:text-olive-300 ${saving ? "opacity-60" : ""}`}
      />
      {undoPrev !== null ? (
        <span className="absolute right-0 top-full z-20 mt-1 inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-olive-900 px-2.5 py-1 text-xs text-white shadow-lg">
          Price saved
          <button type="button" onClick={doUndo} className="font-medium text-emerald-300 underline underline-offset-2 hover:text-emerald-200">
            Undo
          </button>
        </span>
      ) : null}
    </div>
  );
}
