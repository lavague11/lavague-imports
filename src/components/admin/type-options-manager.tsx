"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";

// Manage the controlled TYPE list (PRODUCT_TAGS §1).
export function TypeOptionsManager({ initial }: { initial: { id: string; name: string }[] }) {
  const [options, setOptions] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/admin/products/tag-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.ok) setOptions(d.options);
    } catch { /* ignore */ } finally {
      setBusy(false);
    }
  };
  const add = () => { const n = name.trim(); if (!n) return; setName(""); void post({ action: "add", name: n }); };

  return (
    <div className="rounded-xl border border-olive-100 bg-white p-4">
      <div className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add a type… (e.g. Olive Oil)"
          className="h-10 flex-1 rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none"
        />
        <button type="button" onClick={add} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50"><Plus className="h-4 w-4" /> Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1.5 rounded-full bg-olive-100 px-2.5 py-1 text-sm text-olive-800">
            {o.name}
            <button type="button" onClick={() => void post({ action: "remove", id: o.id })} aria-label={`Remove ${o.name}`} className="text-olive-500 hover:text-olive-900"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        {options.length === 0 ? <span className="text-sm text-olive-400">No types yet.</span> : null}
      </div>
      <p className="mt-3 text-xs text-olive-400">{options.length} types. Removing a type here doesn’t remove it from products already tagged with it.</p>
    </div>
  );
}
