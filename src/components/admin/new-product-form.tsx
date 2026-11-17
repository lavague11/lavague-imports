"use client";

import { useRef, useState } from "react";
import { Camera, Check, Sparkles, X } from "lucide-react";

import { UNIT_OPTIONS } from "@/lib/units";

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

const ERRORS: Record<string, string> = {
  required: "Name and category are required.",
  create: "Couldn't create the product (duplicate slug, or DB offline?).",
};

interface Suggestion {
  name?: string;
  categorySlug?: string;
  origin?: string;
  unitSizeAmount?: string;
  unitSizeUnit?: string;
  unitsPerCase?: number | null;
  ribbon?: string;
  description?: string;
  fragile?: boolean;
  confidence?: number;
}

export function NewProductForm({
  categories,
  countries,
  errorCode,
}: {
  categories: { slug: string; name: string }[];
  countries: string[];
  errorCode?: string | null;
}) {
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? "Something went wrong.") : null;

  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const originRef = useRef<HTMLInputElement>(null);
  const unitAmountRef = useRef<HTMLInputElement>(null);
  const unitSelectRef = useRef<HTMLSelectElement>(null);
  const casesRef = useRef<HTMLInputElement>(null);
  const ribbonRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const fragileRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<string[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPreviews(files.slice(0, 3).map((f) => URL.createObjectURL(f)));
    if (files[0]) void identify(files[0]);
  };

  const identify = async (file: File) => {
    setIdentifying(true);
    setAiNote(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/admin/products/identify", { method: "POST", body: fd });
      const data = await res.json();
      if (data.configured === false) setAiNote("Auto-fill from the photo needs an ANTHROPIC_API_KEY — fill the form in manually for now.");
      else if (data.suggestion) {
        setSuggestion(data.suggestion);
        setShowPopup(true);
      } else setAiNote("Couldn't identify the item — fill it in manually.");
    } catch {
      setAiNote("Couldn't reach the identifier — fill it in manually.");
    } finally {
      setIdentifying(false);
    }
  };

  const apply = () => {
    const s = suggestion;
    if (!s) return;
    if (nameRef.current && s.name) nameRef.current.value = s.name;
    if (categoryRef.current && s.categorySlug && categories.some((c) => c.slug === s.categorySlug)) categoryRef.current.value = s.categorySlug;
    if (originRef.current && s.origin) originRef.current.value = s.origin;
    if (unitAmountRef.current && s.unitSizeAmount) unitAmountRef.current.value = s.unitSizeAmount;
    if (unitSelectRef.current && s.unitSizeUnit && UNIT_OPTIONS.some((u) => u.value === s.unitSizeUnit)) unitSelectRef.current.value = s.unitSizeUnit;
    if (casesRef.current && s.unitsPerCase != null) casesRef.current.value = String(s.unitsPerCase);
    if (ribbonRef.current && s.ribbon) ribbonRef.current.value = s.ribbon;
    if (descRef.current && s.description) descRef.current.value = s.description;
    if (fragileRef.current && typeof s.fragile === "boolean") fragileRef.current.checked = s.fragile;
    setShowPopup(false);
  };

  const catName = (slug?: string) => categories.find((c) => c.slug === slug)?.name;

  return (
    <form
      action="/admin/products/create"
      method="post"
      encType="multipart/form-data"
      className="space-y-5 rounded-xl border border-olive-100 bg-white p-6"
    >
      {/* Photos — at the top, one multi-image picker that also drives auto-fill */}
      <div>
        <label className="mb-1 block text-sm font-medium text-olive-800">Photos</label>
        <p className="mb-2 text-xs text-olive-500">Upload or take one or more photos (the first is the main photo). We&apos;ll try to identify the product and fill in the form.</p>
        <input ref={fileRef} type="file" name="images" accept="image/*" multiple onChange={onPick} className="hidden" />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-olive-200 bg-olive-50/50 px-4 py-2.5 text-sm font-medium text-olive-700 hover:bg-olive-50"
          >
            <Camera className="h-5 w-5" /> {previews.length ? "Change photos" : "Add or take photos"}
          </button>
          {identifying ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-olive-600">
              <Sparkles className="h-4 w-4 animate-pulse" /> Identifying…
            </span>
          ) : null}
        </div>
        {previews.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((p, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={i} src={p} alt="" className="h-20 w-20 rounded-lg border border-olive-100 object-cover" />
            ))}
          </div>
        ) : null}
        {aiNote ? <p className="mt-2 text-xs text-olive-500">{aiNote}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-olive-800">Name *</label>
          <input ref={nameRef} id="name" name="name" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="categorySlug" className="mb-1 block text-sm font-medium text-olive-800">Category *</label>
          <select ref={categoryRef} id="categorySlug" name="categorySlug" required defaultValue="" className={inputClass}>
            <option value="" disabled>Choose…</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sku" className="mb-1 block text-sm font-medium text-olive-800">SKU</label>
          <input id="sku" name="sku" placeholder="auto if blank" className={inputClass} />
        </div>
        <div>
          <label htmlFor="origin" className="mb-1 block text-sm font-medium text-olive-800">Country of origin</label>
          <input ref={originRef} id="origin" name="origin" list="country-options" placeholder="Type or choose…" className={inputClass} />
          <datalist id="country-options">
            {countries.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="unitSizeAmount" className="mb-1 block text-sm font-medium text-olive-800">Unit size</label>
          <input ref={unitAmountRef} id="unitSizeAmount" name="unitSizeAmount" inputMode="decimal" placeholder="e.g. 70" className={inputClass} />
        </div>
        <div>
          <label htmlFor="unitSizeUnit" className="mb-1 block text-sm font-medium text-olive-800">Unit</label>
          <select ref={unitSelectRef} id="unitSizeUnit" name="unitSizeUnit" defaultValue="" className={inputClass}>
            <option value="">— none —</option>
            {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="unitsPerCase" className="mb-1 block text-sm font-medium text-olive-800">Units per case</label>
          <input ref={casesRef} id="unitsPerCase" name="unitsPerCase" inputMode="numeric" placeholder="e.g. 24" className={inputClass} />
        </div>
        <div>
          <label htmlFor="price" className="mb-1 block text-sm font-medium text-olive-800">Price each (USD)</label>
          <input id="price" name="price" inputMode="decimal" placeholder="blank = on request" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="ribbon" className="mb-1 block text-sm font-medium text-olive-800">Ribbon / badge</label>
        <input ref={ribbonRef} id="ribbon" name="ribbon" placeholder="e.g. Best Seller" className={inputClass} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-olive-800">Description</label>
        <textarea ref={descRef} id="description" name="description" rows={3} className={`${inputClass} h-auto py-2`} />
      </div>

      <label className="flex items-center gap-2 text-sm text-olive-800">
        <input ref={fragileRef} type="checkbox" name="fragile" className="h-4 w-4 accent-olive-800" />
        Fragile (glass bottle / breakable)
      </label>

      {errorMessage ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</p>
      ) : null}

      <button type="submit" className="h-11 rounded-lg bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800">
        Create product
      </button>

      {/* "Is this the item?" popup */}
      {showPopup && suggestion ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPopup(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 font-display text-lg text-olive-900">
                <Sparkles className="h-5 w-5 text-olive-700" /> Is this the item?
              </h3>
              <button type="button" onClick={() => setShowPopup(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            {previews[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previews[0]} alt="" className="mt-3 h-36 w-full rounded-lg border border-olive-100 bg-olive-50 object-contain" />
            ) : null}
            <p className="mt-3 text-lg font-semibold text-olive-900">{suggestion.name || "Unknown product"}</p>
            <ul className="mt-1 space-y-0.5 text-sm text-olive-600">
              {catName(suggestion.categorySlug) ? <li>Category: {catName(suggestion.categorySlug)}</li> : null}
              {suggestion.origin ? <li>Origin: {suggestion.origin}</li> : null}
              {suggestion.unitSizeAmount || suggestion.unitSizeUnit ? <li>Size: {[suggestion.unitSizeAmount, suggestion.unitSizeUnit].filter(Boolean).join(" ")}</li> : null}
              {suggestion.unitsPerCase != null ? <li>{suggestion.unitsPerCase}/case</li> : null}
            </ul>
            {suggestion.description ? <p className="mt-2 text-sm text-olive-500">{suggestion.description}</p> : null}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={apply} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-olive-800">
                <Check className="h-4 w-4" /> Yes, fill it in
              </button>
              <button type="button" onClick={() => setShowPopup(false)} className="rounded-lg border border-olive-200 px-4 py-2.5 text-sm text-olive-700 hover:bg-olive-50">
                No
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
