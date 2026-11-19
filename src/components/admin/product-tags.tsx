"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Plus, Tag } from "lucide-react";

type TagKind = "BRAND" | "TYPE" | "SIZE" | "VARIANT" | "SPOKEN";

export interface ProductTagItem {
  id: string;
  kind: TagKind;
  value: string;
  lang: string | null;
}

const STRUCTURED: { kind: TagKind; label: string; placeholder: string }[] = [
  { kind: "BRAND", label: "Brand", placeholder: "e.g. Al Maghribya" },
  { kind: "TYPE", label: "Type", placeholder: "Pick a type…" },
  { kind: "SIZE", label: "Size", placeholder: "e.g. 1 L, 70 g, 12 ct" },
  { kind: "VARIANT", label: "Variant / flavor", placeholder: "e.g. Spicy, Mint" },
];

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Editable tag chips on the product edit form (PRODUCT_TAGS §1). One each of
 *  Brand/Type/Size/Variant, plus spoken names; 8 tags total; never required. */
export function ProductTags({
  slug,
  tags: initial,
  typeOptions,
}: {
  slug: string;
  tags: ProductTagItem[];
  typeOptions: { id: string; name: string }[];
}) {
  const [tags, setTags] = useState<ProductTagItem[]>(initial);
  const [spoken, setSpoken] = useState("");
  const [structInput, setStructInput] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byKind = (k: TagKind) => tags.filter((t) => t.kind === k);
  const atCap = tags.length >= 8;

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/admin/products/${slug}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) setTags(d.tags as ProductTagItem[]);
      else setErr(d.error === "cap" ? "Max 8 tags — remove one first." : d.error === "empty" ? null : "Couldn't update tags.");
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const addStructured = (kind: TagKind) => {
    const v = (structInput[kind] ?? "").trim();
    if (!v) return;
    setStructInput((s) => ({ ...s, [kind]: "" }));
    void post({ action: "add", kind, value: v });
  };
  const addSpoken = () => {
    const v = spoken.trim();
    if (!v) return;
    setSpoken("");
    void post({ action: "add", kind: "SPOKEN", value: v, lang: hasArabic(v) ? "ar" : "en" });
  };
  const remove = (id: string) => void post({ action: "remove", id });

  const inputCls = "h-9 flex-1 rounded-lg border border-olive-200 px-2.5 text-sm focus:border-olive-500 focus:outline-none";

  return (
    <div className="rounded-xl border border-olive-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-olive-800">
          <Tag className="h-4 w-4 text-olive-500" /> Tags
        </h3>
        <span className={`text-xs ${atCap ? "text-amber-600" : "text-olive-400"}`}>{tags.length}/8</span>
      </div>
      <p className="mb-3 text-xs text-olive-400">Help voice ordering find this product. Optional — never required to save.</p>

      <div className="space-y-3">
        {STRUCTURED.map(({ kind, label, placeholder }) => {
          const current = byKind(kind)[0];
          return (
            <div key={kind}>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-olive-600">
                {label}
                {kind === "TYPE" ? <Link href="/admin/products/types" className="font-normal text-olive-400 underline underline-offset-2 hover:text-olive-700">manage list</Link> : null}
              </label>
              {current ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-olive-100 px-2.5 py-1 text-sm text-olive-800">
                  {current.value}
                  <button type="button" onClick={() => remove(current.id)} aria-label={`Remove ${label}`} className="text-olive-500 hover:text-olive-900"><X className="h-3.5 w-3.5" /></button>
                </span>
              ) : kind === "TYPE" ? (
                <div className="flex gap-2">
                  <select
                    value={structInput.TYPE ?? ""}
                    onChange={(e) => { const v = e.target.value; setStructInput((s) => ({ ...s, TYPE: v })); if (v) void post({ action: "add", kind: "TYPE", value: v }).then(() => setStructInput((s) => ({ ...s, TYPE: "" }))); }}
                    disabled={busy || atCap}
                    className={inputCls}
                  >
                    <option value="">{placeholder}</option>
                    {typeOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={structInput[kind] ?? ""}
                    onChange={(e) => setStructInput((s) => ({ ...s, [kind]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStructured(kind); } }}
                    placeholder={placeholder}
                    disabled={busy || atCap}
                    className={inputCls}
                  />
                  <button type="button" onClick={() => addStructured(kind)} disabled={busy || atCap} className="inline-flex items-center gap-1 rounded-lg border border-olive-300 px-2.5 text-sm font-medium text-olive-700 hover:bg-olive-50 disabled:opacity-50"><Plus className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          );
        })}

        <div>
          <label className="mb-1 block text-xs font-medium text-olive-600">Spoken names <span className="font-normal text-olive-400">(English, Arabic, Darija, misspellings)</span></label>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {byKind("SPOKEN").map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-olive-50 px-2.5 py-1 text-sm text-olive-800" dir={hasArabic(t.value) ? "rtl" : "ltr"}>
                {t.value}
                <button type="button" onClick={() => remove(t.id)} aria-label={`Remove ${t.value}`} className="text-olive-500 hover:text-olive-900"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
            {byKind("SPOKEN").length === 0 ? <span className="text-xs text-olive-400">None yet.</span> : null}
          </div>
          <div className="flex gap-2">
            <input
              value={spoken}
              onChange={(e) => setSpoken(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSpoken(); } }}
              placeholder="Add a spoken name…"
              disabled={busy || atCap}
              className={inputCls}
            />
            <button type="button" onClick={addSpoken} disabled={busy || atCap} className="inline-flex items-center gap-1 rounded-lg border border-olive-300 px-2.5 text-sm font-medium text-olive-700 hover:bg-olive-50 disabled:opacity-50"><Plus className="h-4 w-4" /> Add</button>
          </div>
        </div>
      </div>

      {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
    </div>
  );
}
