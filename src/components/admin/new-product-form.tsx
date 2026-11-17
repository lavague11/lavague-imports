"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Check, ExternalLink, ScanBarcode, Sparkles, Wand2, X } from "lucide-react";

import { BarcodeScanner } from "@/components/admin/barcode-scanner";
import { UNIT_OPTIONS } from "@/lib/units";

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

const ERRORS: Record<string, string> = {
  required: "Name and category are required.",
  create: "Couldn't create the product (duplicate slug, or DB offline?).",
};

interface Suggestion {
  name?: string;
  brand?: string;
  categorySlug?: string;
  origin?: string;
  unitSizeAmount?: string;
  unitSizeUnit?: string;
  piecesPerCase?: number | null;
  piecesPerCaseGuess?: number | null;
  suggestedSku?: string;
  ribbon?: string;
  description?: string;
  fragile?: boolean;
  confidence?: number;
}

// Provenance tags for each result row.
type Source = "scanned" | "catalog" | "online" | "label" | "suggested" | "estimate";
const SOURCE_TAG: Record<Source, { label: string; cls: string }> = {
  scanned: { label: "scanned", cls: "bg-sky-100 text-sky-700" },
  catalog: { label: "in catalog", cls: "bg-emerald-100 text-emerald-700" },
  online: { label: "online", cls: "bg-violet-100 text-violet-700" },
  label: { label: "read from label", cls: "bg-olive-100 text-olive-700" },
  suggested: { label: "suggested", cls: "bg-amber-100 text-amber-800" },
  estimate: { label: "estimate", cls: "bg-amber-100 text-amber-800" },
};
const PREC: Record<Source, number> = { catalog: 4, online: 3, label: 2, scanned: 1, suggested: 1, estimate: 1 };

interface RowState {
  value: string;
  source: Source | null;
}
type RowKey = "name" | "brand" | "categorySlug" | "origin" | "size" | "piecesPerCase" | "barcode" | "sku";
type Rows = Record<RowKey, RowState>;

const emptyRows = (): Rows => ({
  name: { value: "", source: null },
  brand: { value: "", source: null },
  categorySlug: { value: "", source: null },
  origin: { value: "", source: null },
  size: { value: "", source: null },
  piecesPerCase: { value: "", source: null },
  barcode: { value: "", source: null },
  sku: { value: "", source: null },
});

// Parse "500 ml" → { amount: "500", unit: "ml" }, mapping to a known unit when possible.
function parseSize(size: string): { amount: string; unit: string } {
  const m = size.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?/);
  if (!m) return { amount: "", unit: "" };
  const amount = m[1] ?? "";
  const raw = (m[2] ?? "").toLowerCase().replace(/s$/, "");
  const unit = UNIT_OPTIONS.some((u) => u.value === raw) ? raw : "";
  return { amount, unit };
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
  const brandRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const originRef = useRef<HTMLInputElement>(null);
  const unitAmountRef = useRef<HTMLInputElement>(null);
  const unitSelectRef = useRef<HTMLSelectElement>(null);
  const casesRef = useRef<HTMLInputElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);
  const ribbonRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const fragileRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<string[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [rows, setRows] = useState<Rows>(emptyRows());
  const [extras, setExtras] = useState<{ description?: string; fragile?: boolean; ribbon?: string }>({});
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [catalogHit, setCatalogHit] = useState<{ slug: string; name: string } | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  // Photo enhance (OpenAI). We always keep the original file and only swap the
  // enhanced one in on "Keep".
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [enhancing, setEnhancing] = useState<null | "flare" | "sunburst">(null);
  const [enhanced, setEnhanced] = useState<{ url: string; tier: string } | null>(null);
  const [enhanceNote, setEnhanceNote] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Apply a value to a row only if it beats what's already there (by source precedence).
  const applyToRows = useCallback((patch: { key: RowKey; value: string; source: Source }[]) => {
    setRows((prev) => {
      const next = { ...prev };
      for (const { key, value, source } of patch) {
        if (!value) continue;
        const cur = next[key];
        if (!cur.value || !cur.source || PREC[source] >= PREC[cur.source]) {
          next[key] = { value, source };
        }
      }
      return next;
    });
  }, []);

  // ---- Barcode lookup (catalog → Open Food Facts) ----
  const lookupBarcode = useCallback(
    async (codeRaw: string) => {
      const code = codeRaw.replace(/[^0-9]/g, "");
      if (code.length < 6) return;
      setBarcode(code);
      setCatalogHit(null);
      setLookupNote(null);
      applyToRows([{ key: "barcode", value: code, source: "scanned" }]);
      try {
        const res = await fetch(`/admin/products/lookup?barcode=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data?.catalog?.found) {
          setCatalogHit({ slug: data.catalog.slug, name: data.catalog.name });
          applyToRows([
            { key: "name", value: data.catalog.name ?? "", source: "catalog" },
            { key: "brand", value: data.catalog.brand ?? "", source: "catalog" },
          ]);
        } else if (data?.off?.found) {
          applyToRows([
            { key: "name", value: data.off.name ?? "", source: "online" },
            { key: "brand", value: data.off.brand ?? "", source: "online" },
            { key: "size", value: data.off.size ?? "", source: "online" },
            { key: "origin", value: data.off.origin ?? "", source: "online" },
          ]);
          setLookupNote("Found in Open Food Facts — prefilled below.");
        } else {
          setLookupNote("Barcode not in our catalog or Open Food Facts — add the details below.");
        }
        setShowPopup(true);
      } catch {
        setLookupNote("Couldn't reach the lookup service — enter the details manually.");
      }
    },
    [applyToRows],
  );

  const onBarcodeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // USB scanners type the digits and press Enter. Don't submit the form.
    if (e.key === "Enter") {
      e.preventDefault();
      void lookupBarcode((e.target as HTMLInputElement).value);
    }
  };

  // ---- Photo identify ----
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPreviews(files.slice(0, 3).map((f) => URL.createObjectURL(f)));
    setOriginalFile(files[0] ?? null);
    setExtraFiles(files.slice(1, 3));
    setEnhanced(null);
    setEnhanceNote(null);
    if (files[0]) void identify(files[0]);
  };

  // ---- Photo enhance (OpenAI, two tiers) ----
  const runEnhance = async (tier: "flare" | "sunburst", fb?: string) => {
    if (!originalFile) return;
    setEnhancing(tier);
    setEnhanceNote(null);
    setEnhanced(null);
    try {
      const fd = new FormData();
      fd.append("image", originalFile); // always the ORIGINAL
      fd.append("tier", tier);
      if (fb) fd.append("feedback", fb);
      const res = await fetch("/admin/products/enhance", { method: "POST", body: fd });
      const data = await res.json();
      if (data.configured === false) setEnhanceNote("Photo enhance needs an OPENAI_API_KEY — add it under /developers to turn this on.");
      else if (data.image) setEnhanced({ url: data.image, tier });
      else setEnhanceNote("Couldn't enhance the photo — try again.");
    } catch {
      setEnhanceNote("Couldn't reach the enhancer — try again.");
    } finally {
      setEnhancing(null);
    }
  };

  const dataUrlToFile = async (url: string, name: string): Promise<File> => {
    const blob = await (await fetch(url)).blob();
    return new File([blob], name, { type: blob.type || "image/png" });
  };

  // "Keep": enhanced becomes the main product photo; the original is retained as a gallery image.
  const keepEnhanced = async () => {
    if (!enhanced || !fileRef.current) return;
    const enhancedFile = await dataUrlToFile(enhanced.url, "enhanced.png");
    const keepFiles = [enhancedFile, ...(originalFile ? [originalFile] : []), ...extraFiles].slice(0, 3);
    const dt = new DataTransfer();
    keepFiles.forEach((f) => dt.items.add(f));
    fileRef.current.files = dt.files;
    setPreviews(keepFiles.map((f) => URL.createObjectURL(f)));
    setEnhanced(null);
    setEnhanceNote("Enhanced photo saved as the main image. Original kept in the gallery.");
  };

  const identify = async (file: File) => {
    setIdentifying(true);
    setAiNote(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (barcode) fd.append("barcode", barcode);
      const res = await fetch("/admin/products/identify", { method: "POST", body: fd });
      const data = await res.json();
      if (data.configured === false) {
        setAiNote("Auto-fill from the photo needs an ANTHROPIC_API_KEY — fill the form in manually for now.");
        return;
      }
      const s: Suggestion | null = data.suggestion ?? null;
      if (!s) {
        setAiNote("Couldn't identify the item — fill it in manually.");
        return;
      }
      const size = [s.unitSizeAmount, s.unitSizeUnit].filter(Boolean).join(" ").trim();
      const patch: { key: RowKey; value: string; source: Source }[] = [
        { key: "name", value: s.name ?? "", source: "label" },
        { key: "brand", value: s.brand ?? "", source: "label" },
        { key: "categorySlug", value: s.categorySlug ?? "", source: "label" },
        { key: "origin", value: s.origin ?? "", source: "label" },
        { key: "size", value: size, source: "label" },
        { key: "sku", value: s.suggestedSku ?? "", source: "suggested" },
      ];
      if (s.piecesPerCase != null) patch.push({ key: "piecesPerCase", value: String(s.piecesPerCase), source: "label" });
      else if (s.piecesPerCaseGuess != null) patch.push({ key: "piecesPerCase", value: String(s.piecesPerCaseGuess), source: "estimate" });
      applyToRows(patch);
      setExtras({ description: s.description, fragile: s.fragile, ribbon: s.ribbon });
      setShowPopup(true);
    } catch {
      setAiNote("Couldn't reach the identifier — fill it in manually.");
    } finally {
      setIdentifying(false);
    }
  };

  const setRowValue = (key: RowKey, value: string) =>
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], value } }));

  // ---- Copy every row into the form ----
  const apply = () => {
    if (nameRef.current && rows.name.value) nameRef.current.value = rows.name.value;
    if (brandRef.current) brandRef.current.value = rows.brand.value;
    if (categoryRef.current && rows.categorySlug.value && categories.some((c) => c.slug === rows.categorySlug.value))
      categoryRef.current.value = rows.categorySlug.value;
    if (originRef.current) originRef.current.value = rows.origin.value;
    if (rows.size.value) {
      const { amount, unit } = parseSize(rows.size.value);
      if (unitAmountRef.current) unitAmountRef.current.value = amount;
      if (unitSelectRef.current && unit) unitSelectRef.current.value = unit;
    }
    if (casesRef.current) casesRef.current.value = rows.piecesPerCase.value.replace(/[^0-9]/g, "");
    if (skuRef.current) skuRef.current.value = rows.sku.value;
    setBarcode(rows.barcode.value);
    if (descRef.current && extras.description) descRef.current.value = extras.description;
    if (fragileRef.current && typeof extras.fragile === "boolean") fragileRef.current.checked = extras.fragile;
    if (ribbonRef.current && extras.ribbon) ribbonRef.current.value = extras.ribbon;
    setShowPopup(false);
  };

  const ROW_META: { key: RowKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "brand", label: "Brand" },
    { key: "categorySlug", label: "Category" },
    { key: "origin", label: "Origin" },
    { key: "size", label: "Size" },
    { key: "piecesPerCase", label: "Pieces per case" },
    { key: "barcode", label: "Barcode" },
    { key: "sku", label: "Suggested SKU" },
  ];

  return (
    <form
      action="/admin/products/create"
      method="post"
      encType="multipart/form-data"
      className="space-y-5 rounded-xl border border-olive-100 bg-white p-6"
    >
      <style>{`@keyframes lvScanSweep{0%{top:0%}50%{top:100%}100%{top:0%}}`}</style>

      {/* Photos + scan — at the top, driving auto-fill */}
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
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-olive-200 bg-olive-50/50 px-4 py-2.5 text-sm font-medium text-olive-700 hover:bg-olive-50"
          >
            <ScanBarcode className="h-5 w-5" /> Scan barcode
          </button>
          {identifying ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-olive-600">
              <Sparkles className="h-4 w-4 animate-pulse" /> Analyzing…
            </span>
          ) : null}
        </div>

        {previews.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((p, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-olive-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" />
                {identifying && i === 0 ? (
                  <span
                    className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]"
                    style={{ animation: "lvScanSweep 1.5s ease-in-out infinite" }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {aiNote ? <p className="mt-2 text-xs text-olive-500">{aiNote}</p> : null}

        {/* Enhance photo (two tiers, OpenAI) */}
        {originalFile ? (
          <div className="mt-3 rounded-lg border border-olive-100 bg-olive-50/40 p-3">
            {!enhanced ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void runEnhance("flare")}
                  disabled={enhancing !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-olive-300 bg-white px-3 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-60"
                >
                  <Wand2 className="h-4 w-4" /> {enhancing === "flare" ? "Enhancing…" : "Enhance photo"}
                </button>
                <span className="text-xs text-olive-500">Clean white studio background, sharp focus — your product kept exactly as-is.</span>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs font-medium text-olive-600">
                  Enhanced ({enhanced.tier === "sunburst" ? "high quality" : "quick clean-up"})
                </p>
                <div className="flex flex-wrap items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={enhanced.url} alt="Enhanced product" className="h-40 w-40 rounded-lg border border-olive-200 bg-white object-contain" />
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => void keepEnhanced()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
                      <Check className="h-4 w-4" /> Keep
                    </button>
                    <button type="button" onClick={() => { setEnhanced(null); setEnhanceNote(null); }} className="rounded-lg border border-olive-200 bg-white px-4 py-2 text-sm text-olive-700 hover:bg-olive-50">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFeedback(true)}
                      disabled={enhancing !== null}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-olive-300 bg-white px-4 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-60"
                    >
                      <Wand2 className="h-4 w-4" /> {enhancing === "sunburst" ? "Working…" : "Make it better"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {enhanceNote ? <p className="mt-2 text-xs text-olive-500">{enhanceNote}</p> : null}
          </div>
        ) : null}
      </div>

      {/* Barcode row (USB scanner types here; Enter looks it up) */}
      <div>
        <label htmlFor="barcode" className="mb-1 block text-sm font-medium text-olive-800">Barcode (EAN-13 / UPC)</label>
        <div className="flex gap-2">
          <input
            id="barcode"
            name="barcode"
            value={barcode}
            inputMode="numeric"
            autoComplete="off"
            onChange={(e) => setBarcode(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={onBarcodeKey}
            placeholder="Scan, or type and press Enter"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void lookupBarcode(barcode)}
            className="h-10 shrink-0 rounded-lg border border-olive-200 px-4 text-sm font-medium text-olive-700 hover:bg-olive-50"
          >
            Look up
          </button>
        </div>
        {catalogHit ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
            Already in catalog —
            <a href={`/admin/products/${catalogHit.slug}`} className="inline-flex items-center gap-1 font-medium underline">
              {catalogHit.name} <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        ) : lookupNote ? (
          <p className="mt-2 text-xs text-olive-500">{lookupNote}</p>
        ) : null}
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
          <label htmlFor="brand" className="mb-1 block text-sm font-medium text-olive-800">Brand</label>
          <input ref={brandRef} id="brand" name="brand" placeholder="Optional" className={inputClass} />
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
          <label htmlFor="sku" className="mb-1 block text-sm font-medium text-olive-800">SKU</label>
          <input ref={skuRef} id="sku" name="sku" placeholder="auto if blank" className={inputClass} />
        </div>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="mb-1 block text-sm font-medium text-olive-800">Price each (USD)</label>
          <input id="price" name="price" inputMode="decimal" placeholder="blank = on request" className={inputClass} />
        </div>
        <div>
          <label htmlFor="ribbon" className="mb-1 block text-sm font-medium text-olive-800">Ribbon / badge</label>
          <input ref={ribbonRef} id="ribbon" name="ribbon" placeholder="e.g. Best Seller" className={inputClass} />
        </div>
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

      {/* "Make it better" — what's wrong with it? */}
      {showFeedback ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowFeedback(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-olive-900">What&apos;s wrong with it?</h3>
            <p className="mt-1 text-xs text-olive-500">A quick note — we&apos;ll redo it at high quality from your original photo.</p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. label is blurry, background still grey"
              className="mt-3 w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => { setShowFeedback(false); void runEnhance("sunburst", feedback.trim()); }}
                disabled={!feedback.trim()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50"
              >
                <Wand2 className="h-4 w-4" /> Make it better
              </button>
              <button type="button" onClick={() => setShowFeedback(false)} className="rounded-lg border border-olive-200 px-4 py-2.5 text-sm text-olive-700 hover:bg-olive-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Camera scanner */}
      {scanning ? (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onDetected={(code) => {
            setScanning(false);
            void lookupBarcode(code);
          }}
        />
      ) : null}

      {/* "Is this the item?" — one editable field per row, each tagged with its source */}
      {showPopup ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setShowPopup(false)}>
          <div className="mt-2 w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 font-display text-lg text-olive-900">
                <Sparkles className="h-5 w-5 text-olive-700" /> Is this the item?
              </h3>
              <button type="button" onClick={() => setShowPopup(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
              {previews[0] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previews[0]} alt="" className="mb-3 h-32 w-full rounded-lg border border-olive-100 bg-olive-50 object-contain" />
              ) : null}
              {catalogHit ? (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                  This barcode is already in the catalog —{" "}
                  <a href={`/admin/products/${catalogHit.slug}`} className="font-medium underline">{catalogHit.name}</a>.
                </p>
              ) : null}

              <div className="space-y-2.5">
                {ROW_META.map(({ key, label }) => {
                  const row = rows[key];
                  const tag = row.source ? SOURCE_TAG[row.source] : null;
                  return (
                    <div key={key}>
                      <div className="mb-0.5 flex items-center gap-2">
                        <label className="text-xs font-medium text-olive-600">{label}</label>
                        {tag ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tag.cls}`}>{tag.label}</span> : null}
                      </div>
                      {key === "categorySlug" ? (
                        <select value={row.value} onChange={(e) => setRowValue(key, e.target.value)} className={inputClass}>
                          <option value="">— choose —</option>
                          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                        </select>
                      ) : (
                        <input
                          value={row.value}
                          onChange={(e) => setRowValue(key, e.target.value)}
                          inputMode={key === "barcode" || key === "piecesPerCase" ? "numeric" : undefined}
                          placeholder="—"
                          className={inputClass}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 border-t border-olive-100 px-4 py-3">
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
