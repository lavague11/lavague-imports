"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Check, ExternalLink, Plus, ScanBarcode, Sparkles, Star, Trash2, Wand2, X } from "lucide-react";

import { saveProduct } from "@/app/admin/actions";
import { BarcodeScanner } from "@/components/admin/barcode-scanner";
import { idleFormState } from "@/lib/form";
import { UNIT_OPTIONS, parseUnitSize } from "@/lib/units";

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

interface RowState { value: string; source: Source | null }
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

function parseSize(size: string): { amount: string; unit: string } {
  const m = size.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?/);
  if (!m) return { amount: "", unit: "" };
  const amount = m[1] ?? "";
  const raw = (m[2] ?? "").toLowerCase().replace(/s$/, "");
  const unit = UNIT_OPTIONS.some((u) => u.value === raw) ? raw : "";
  return { amount, unit };
}

export interface ProductFormVariant {
  sku: string;
  name: string;
  retailPriceCents: number | null;
  unitsPerCase: number | null;
}
export interface ProductFormData {
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  images: string[];
  origin: string | null;
  ribbon: string | null;
  isFeatured: boolean;
  isActive: boolean;
  isFragile: boolean;
  categorySlug: string;
  source: string | null;
  storeUrl: string;
  variants: ProductFormVariant[];
}

interface Photo { key: string; preview: string; url?: string; file?: File }
interface SizeRow { key: string; sku?: string; amount: string; unit: string; cases: string; price: string }

function seedSizeRows(variants: ProductFormVariant[]): SizeRow[] {
  if (!variants.length) return [{ key: "n0", amount: "", unit: "", cases: "", price: "" }];
  return variants.map((v) => {
    const p = parseUnitSize(v.name);
    return {
      key: `v-${v.sku}`,
      sku: v.sku,
      amount: p.amount,
      unit: p.unit,
      cases: v.unitsPerCase != null ? String(v.unitsPerCase) : "",
      price: v.retailPriceCents != null ? (v.retailPriceCents / 100).toFixed(2) : "",
    };
  });
}

function EditSave() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-11 w-full rounded-lg bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60 sm:w-auto">
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

/**
 * The single product form for New AND Edit (PRODUCTS_UI §3). Same photo-first
 * layout, fields and order in both modes. New posts to the create route; Edit
 * uses the saveProduct server action (unchanged save path). Images submit as
 * per-slot imageUrl<i>/imageFile<i> fields, which collectImagesFromForm handles
 * for both paths — so existing photos are preserved on edit.
 */
export function ProductForm({
  mode,
  product,
  categories,
  countries,
  errorCode,
}: {
  mode: "new" | "edit";
  product?: ProductFormData;
  categories: { slug: string; name: string }[];
  countries: string[];
  errorCode?: string | null;
}) {
  const isEdit = mode === "edit";
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? "Something went wrong.") : null;
  const [state, formAction] = useActionState(saveProduct, idleFormState);

  const primarySku = product?.variants[0]?.sku ?? "";

  const nameRef = useRef<HTMLInputElement>(null);
  const brandRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const originRef = useRef<HTMLInputElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);
  const ribbonRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const fragileRef = useRef<HTMLInputElement>(null);

  const [sizeRows, setSizeRows] = useState<SizeRow[]>(() => seedSizeRows(product?.variants ?? []));
  const setSize = (key: string, patch: Partial<SizeRow>) =>
    setSizeRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addSize = () => setSizeRows((prev) => [...prev, { key: `n${Date.now()}`, amount: "", unit: "", cases: "", price: "" }]);
  const removeSize = (key: string) => setSizeRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));

  const addRef = useRef<HTMLInputElement>(null);
  const slotRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const [photos, setPhotos] = useState<Photo[]>(
    (product?.images ?? []).slice(0, 3).map((url, i) => ({ key: `init-${i}`, preview: url, url })),
  );
  const [identifying, setIdentifying] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [rows, setRows] = useState<Rows>(emptyRows());
  const [extras, setExtras] = useState<{ description?: string; fragile?: boolean; ribbon?: string }>({});
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [catalogHit, setCatalogHit] = useState<{ slug: string; name: string } | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  const [enhancing, setEnhancing] = useState<null | "flare" | "sunburst">(null);
  const [enhanced, setEnhanced] = useState<{ url: string; tier: string } | null>(null);
  const [enhanceNote, setEnhanceNote] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const mainFile = photos[0]?.file ?? null;

  // Keep the hidden per-slot file inputs in sync with the photo tiles, so the
  // form submits imageFile<i> for new files (in tile order).
  useEffect(() => {
    for (let i = 0; i < 3; i++) {
      const input = slotRefs[i].current;
      if (!input) continue;
      const file = photos[i]?.file;
      const dt = new DataTransfer();
      if (file) dt.items.add(file);
      input.files = dt.files;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  const applyToRows = useCallback((patch: { key: RowKey; value: string; source: Source }[]) => {
    setRows((prev) => {
      const next = { ...prev };
      for (const { key, value, source } of patch) {
        if (!value) continue;
        const cur = next[key];
        if (!cur.value || !cur.source || PREC[source] >= PREC[cur.source]) next[key] = { value, source };
      }
      return next;
    });
  }, []);

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
    if (e.key === "Enter") {
      e.preventDefault();
      void lookupBarcode((e.target as HTMLInputElement).value);
    }
  };

  const onAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotos((prev) => {
      const next = [...prev];
      for (const f of files) {
        if (next.length >= 3) break;
        next.push({ key: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, preview: URL.createObjectURL(f), file: f });
      }
      return next;
    });
    const first = files[0];
    if (first && photos.length === 0) void identify(first);
    e.target.value = "";
  };

  const removePhoto = (key: string) => setPhotos((prev) => prev.filter((p) => p.key !== key));
  const makeMain = (key: string) =>
    setPhotos((prev) => {
      const idx = prev.findIndex((p) => p.key === key);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });

  const runEnhance = async (tier: "flare" | "sunburst", fb?: string) => {
    if (!mainFile) return;
    setEnhancing(tier);
    setEnhanceNote(null);
    try {
      const fd = new FormData();
      fd.append("image", mainFile);
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

  const keepEnhanced = async () => {
    if (!enhanced) return;
    const enhancedFile = await dataUrlToFile(enhanced.url, "enhanced.png");
    setPhotos((prev) => {
      const original = prev[0];
      const rest = prev.slice(1);
      const next: Photo[] = [{ key: `enh-${Date.now()}`, preview: enhanced.url, file: enhancedFile }];
      if (original) next.push(original);
      return next.concat(rest).slice(0, 3);
    });
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

  const setRowValue = (key: RowKey, value: string) => setRows((prev) => ({ ...prev, [key]: { ...prev[key], value } }));

  const apply = () => {
    if (nameRef.current && rows.name.value) nameRef.current.value = rows.name.value;
    if (brandRef.current && rows.brand.value) brandRef.current.value = rows.brand.value;
    if (categoryRef.current && rows.categorySlug.value && categories.some((c) => c.slug === rows.categorySlug.value))
      categoryRef.current.value = rows.categorySlug.value;
    if (originRef.current && rows.origin.value) originRef.current.value = rows.origin.value;
    // Seed the first size row from the identified size / pieces-per-case.
    if (rows.size.value || rows.piecesPerCase.value) {
      const { amount, unit } = parseSize(rows.size.value);
      setSizeRows((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        next[0] = {
          ...next[0],
          ...(rows.size.value ? { amount, ...(unit ? { unit } : {}) } : {}),
          ...(rows.piecesPerCase.value ? { cases: rows.piecesPerCase.value.replace(/[^0-9]/g, "") } : {}),
        };
        return next;
      });
    }
    if (skuRef.current && rows.sku.value) skuRef.current.value = rows.sku.value;
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

  const formProps = isEdit
    ? { action: formAction }
    : { action: "/admin/products/create", method: "post" as const, encType: "multipart/form-data" as const };

  return (
    <form {...formProps} className="space-y-5 rounded-xl border border-olive-100 bg-white p-6">
      <style>{`@keyframes lvScanSweep{0%{top:0%}50%{top:100%}100%{top:0%}}`}</style>
      {isEdit && product ? <input type="hidden" name="slug" value={product.slug} /> : null}

      {/* Per-slot image fields (kept URL + synced file). collectImagesFromForm reads these in order. */}
      {[0, 1, 2].map((i) => (
        <div key={`slot-${i}`} className="hidden">
          <input type="hidden" name={`imageUrl${i}`} value={photos[i]?.url ?? ""} readOnly />
          <input ref={slotRefs[i]} type="file" name={`imageFile${i}`} accept="image/*" tabIndex={-1} />
        </div>
      ))}
      <input ref={addRef} type="file" accept="image/*" multiple onChange={onAddPhotos} className="hidden" />

      {/* Photos + scan — photo-first, driving auto-fill */}
      <div>
        <label className="mb-1 block text-sm font-medium text-olive-800">Photos</label>
        <p className="mb-2 text-xs text-olive-500">Add up to 3 photos — the first is the main photo. We&apos;ll try to identify the product and fill in the form.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => addRef.current?.click()} disabled={photos.length >= 3} className="inline-flex items-center gap-2 rounded-lg border border-olive-200 bg-olive-50/50 px-4 py-2.5 text-sm font-medium text-olive-700 hover:bg-olive-50 disabled:opacity-50">
            <Camera className="h-5 w-5" /> Add or take photos
          </button>
          <button type="button" onClick={() => setScanning(true)} className="inline-flex items-center gap-2 rounded-lg border border-olive-200 bg-olive-50/50 px-4 py-2.5 text-sm font-medium text-olive-700 hover:bg-olive-50">
            <ScanBarcode className="h-5 w-5" /> Scan barcode
          </button>
          {identifying ? <span className="inline-flex items-center gap-1.5 text-sm text-olive-600"><Sparkles className="h-4 w-4 animate-pulse" /> Analyzing…</span> : null}
        </div>

        {photos.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative h-24 w-24 overflow-hidden rounded-lg border border-olive-100 bg-olive-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                {i === 0 ? <span className="absolute left-1 top-1 rounded bg-olive-900/85 px-1.5 py-0.5 text-[10px] font-medium text-white">Main</span> : (
                  <button type="button" onClick={() => makeMain(p.key)} title="Make main" className="absolute left-1 top-1 rounded bg-white/85 p-0.5 text-olive-600 hover:text-olive-900"><Star className="h-3.5 w-3.5" /></button>
                )}
                <button type="button" onClick={() => removePhoto(p.key)} aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-white/85 p-0.5 text-olive-500 hover:text-red-700"><X className="h-3.5 w-3.5" /></button>
                {identifying && i === 0 ? <span className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" style={{ animation: "lvScanSweep 1.5s ease-in-out infinite" }} /> : null}
              </div>
            ))}
          </div>
        ) : null}
        {aiNote ? <p className="mt-2 text-xs text-olive-500">{aiNote}</p> : null}

        {mainFile ? (
          <div className="mt-3 rounded-lg border border-olive-100 bg-olive-50/40 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void runEnhance("flare")} disabled={enhancing !== null} className="inline-flex items-center gap-2 rounded-lg border border-olive-300 bg-white px-3 py-2 text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-60">
                <Wand2 className="h-4 w-4" /> {enhancing === "flare" ? "Enhancing…" : "Enhance photo"}
              </button>
              <span className="text-xs text-olive-500">Clean white studio background, sharp focus — your product kept exactly as-is.</span>
            </div>
            {enhanceNote ? <p className="mt-2 text-xs text-olive-500">{enhanceNote}</p> : null}
          </div>
        ) : null}
      </div>

      {/* Barcode */}
      <div>
        <label htmlFor="barcode" className="mb-1 block text-sm font-medium text-olive-800">Barcode (EAN-13 / UPC)</label>
        <div className="flex gap-2">
          <input id="barcode" name="barcode" value={barcode} inputMode="numeric" autoComplete="off" onChange={(e) => setBarcode(e.target.value.replace(/[^0-9]/g, ""))} onKeyDown={onBarcodeKey} placeholder="Scan, or type and press Enter" className={inputClass} />
          <button type="button" onClick={() => void lookupBarcode(barcode)} className="h-10 shrink-0 rounded-lg border border-olive-200 px-4 text-sm font-medium text-olive-700 hover:bg-olive-50">Look up</button>
        </div>
        {catalogHit ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
            Already in catalog —
            <a href={`/admin/products/${catalogHit.slug}`} className="inline-flex items-center gap-1 font-medium underline">{catalogHit.name} <ExternalLink className="h-3 w-3" /></a>
          </p>
        ) : lookupNote ? <p className="mt-2 text-xs text-olive-500">{lookupNote}</p> : null}
      </div>

      {/* Name / Category / Brand / Country */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-olive-800">Name *</label>
          <input ref={nameRef} id="name" name="name" required defaultValue={product?.name ?? ""} className={inputClass} />
        </div>
        <div>
          <label htmlFor="categorySlug" className="mb-1 block text-sm font-medium text-olive-800">Category *</label>
          <select ref={categoryRef} id="categorySlug" name="categorySlug" required defaultValue={product?.categorySlug ?? ""} className={inputClass}>
            <option value="" disabled>Choose…</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="brand" className="mb-1 block text-sm font-medium text-olive-800">Brand</label>
          <input ref={brandRef} id="brand" name="brand" defaultValue={product?.brand ?? ""} placeholder="Optional" className={inputClass} />
        </div>
        <div>
          <label htmlFor="origin" className="mb-1 block text-sm font-medium text-olive-800">Country of origin</label>
          <input ref={originRef} id="origin" name="origin" list="country-options" defaultValue={product?.origin ?? ""} placeholder="Type or choose…" className={inputClass} />
          <datalist id="country-options">{countries.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>

      {/* SKU (primary) + Ribbon */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sku" className="mb-1 block text-sm font-medium text-olive-800">SKU</label>
          {isEdit ? (
            <input id="sku" value={primarySku} readOnly className={`${inputClass} bg-olive-50 text-olive-500`} />
          ) : (
            <input ref={skuRef} id="sku" name="sku" placeholder="auto if blank" className={inputClass} />
          )}
        </div>
        <div>
          <label htmlFor="ribbon" className="mb-1 block text-sm font-medium text-olive-800">Ribbon / badge</label>
          <input ref={ribbonRef} id="ribbon" name="ribbon" defaultValue={product?.ribbon ?? ""} placeholder="e.g. Best Seller" className={inputClass} />
        </div>
      </div>

      {/* Options & case sizes — one table for every size (§7) */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-medium text-olive-800">Options &amp; case sizes</p>
          <button type="button" onClick={addSize} className="inline-flex items-center gap-1 rounded-lg border border-olive-200 px-2.5 py-1 text-xs font-medium text-olive-700 hover:bg-olive-50">
            <Plus className="h-3.5 w-3.5" /> Add size
          </button>
        </div>
        <p className="mb-2 text-xs text-olive-500">Unit size is the weight/volume of one item (e.g. “70 g”). Units per case is how many ship in a wholesale case. Leave price blank for “On request”.</p>
        <div className="space-y-2">
          {sizeRows.map((r) => {
            const amountName = r.sku ? `sizeAmount__${r.sku}` : "newSizeAmount";
            const unitName = r.sku ? `sizeUnit__${r.sku}` : "newSizeUnit";
            const caseFieldName = r.sku ? `case__${r.sku}` : "newCase";
            const priceFieldName = r.sku ? `price__${r.sku}` : "newPrice";
            return (
              <div key={r.key} className="rounded-lg border border-olive-100 bg-olive-50/40 p-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Unit size</span>
                    <input name={amountName} value={r.amount} onChange={(e) => setSize(r.key, { amount: e.target.value })} inputMode="decimal" placeholder="e.g. 70" className="h-9 w-full rounded-lg border border-olive-200 px-3 text-sm" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Unit</span>
                    <select name={unitName} value={r.unit} onChange={(e) => setSize(r.key, { unit: e.target.value })} className="h-9 w-full rounded-lg border border-olive-200 px-2 text-sm">
                      <option value="">— none —</option>
                      {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Units per case</span>
                    <input name={caseFieldName} value={r.cases} onChange={(e) => setSize(r.key, { cases: e.target.value })} inputMode="numeric" placeholder="—" className="h-9 w-full rounded-lg border border-olive-200 px-3 text-sm placeholder:text-olive-300" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Price each (USD)</span>
                    <input name={priceFieldName} value={r.price} onChange={(e) => setSize(r.key, { price: e.target.value })} inputMode="decimal" placeholder="On request" className="h-9 w-full rounded-lg border border-olive-200 px-3 text-sm placeholder:text-olive-300" />
                  </label>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-olive-400">{r.sku ?? "new size"}</span>
                  {!r.sku && sizeRows.length > 1 ? (
                    <button type="button" onClick={() => removeSize(r.key)} className="inline-flex items-center gap-1 text-[11px] text-olive-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-olive-800">Description</label>
        <textarea ref={descRef} id="description" name="description" rows={3} defaultValue={product?.description ?? ""} className={`${inputClass} h-auto py-2`} />
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-6">
        {isEdit ? (
          <>
            <label className="flex items-center gap-2 text-sm text-olive-800"><input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} className="h-4 w-4 accent-olive-800" /> Visible on store</label>
            <label className="flex items-center gap-2 text-sm text-olive-800"><input type="checkbox" name="isFeatured" defaultChecked={product?.isFeatured ?? false} className="h-4 w-4 accent-olive-800" /> Featured (home best-sellers)</label>
          </>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-olive-800"><input ref={fragileRef} type="checkbox" name="fragile" defaultChecked={product?.isFragile ?? false} className="h-4 w-4 accent-olive-800" /> Fragile (glass bottle / breakable)</label>
      </div>

      {errorMessage ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</p> : null}
      {isEdit && state.status === "error" ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.message}</p> : null}
      {isEdit && state.status === "success" ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved.</p> : null}

      {/* Sticky action bar on mobile; inline on desktop */}
      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t border-olive-100 bg-white/95 px-6 py-3 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        {isEdit ? <EditSave /> : (
          <button type="submit" className="h-11 w-full rounded-lg bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800 sm:w-auto">Create product</button>
        )}
      </div>

      {/* Enhanced result pop-up */}
      {enhanced ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4 sm:p-8" onClick={() => { if (!enhancing) setEnhanced(null); }}>
          <div className="flex w-full max-w-3xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex w-full items-center justify-between text-white/90">
              <span className="text-sm font-medium">Enhanced · {enhanced.tier === "sunburst" ? "high quality" : "quick clean-up"}</span>
              <button type="button" onClick={() => setEnhanced(null)} disabled={enhancing !== null} aria-label="Close" className="text-white/70 hover:text-white disabled:opacity-40"><X className="h-6 w-6" /></button>
            </div>
            <div className="relative w-full overflow-hidden rounded-xl bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enhanced.url} alt="Enhanced product" className="mx-auto max-h-[70vh] w-auto max-w-full object-contain" />
              {enhancing ? <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-medium text-olive-800"><Sparkles className="mr-2 h-5 w-5 animate-pulse" /> Enhancing at high quality…</div> : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => void keepEnhanced()} disabled={enhancing !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50"><Check className="h-4 w-4" /> Keep</button>
              <button type="button" onClick={() => setEnhanced(null)} disabled={enhancing !== null} className="rounded-lg border border-white/40 bg-white/10 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => setShowFeedback(true)} disabled={enhancing !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/10 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50"><Wand2 className="h-4 w-4" /> {enhancing === "sunburst" ? "Working…" : "Make it better"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showFeedback ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowFeedback(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-olive-900">What&apos;s wrong with it?</h3>
            <p className="mt-1 text-xs text-olive-500">A quick note — we&apos;ll redo it at high quality from your original photo.</p>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} autoFocus placeholder="e.g. label is blurry, background still grey" className="mt-3 w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none" />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { setShowFeedback(false); void runEnhance("sunburst", feedback.trim()); }} disabled={!feedback.trim()} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50"><Wand2 className="h-4 w-4" /> Make it better</button>
              <button type="button" onClick={() => setShowFeedback(false)} className="rounded-lg border border-olive-200 px-4 py-2.5 text-sm text-olive-700 hover:bg-olive-50">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {scanning ? <BarcodeScanner onClose={() => setScanning(false)} onDetected={(code) => { setScanning(false); void lookupBarcode(code); }} /> : null}

      {/* "Is this the item?" popup */}
      {showPopup ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setShowPopup(false)}>
          <div className="mt-2 w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 font-display text-lg text-olive-900"><Sparkles className="h-5 w-5 text-olive-700" /> Is this the item?</h3>
              <button type="button" onClick={() => setShowPopup(false)} aria-label="Close" className="text-olive-400 hover:text-olive-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
              {photos[0] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={photos[0].preview} alt="" className="mb-3 h-32 w-full rounded-lg border border-olive-100 bg-olive-50 object-contain" />
              ) : null}
              {catalogHit ? (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">This barcode is already in the catalog — <a href={`/admin/products/${catalogHit.slug}`} className="font-medium underline">{catalogHit.name}</a>.</p>
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
                        <select value={row.value} onChange={(e) => setRowValue(key, e.target.value)} className={inputClass}><option value="">— choose —</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
                      ) : (
                        <input value={row.value} onChange={(e) => setRowValue(key, e.target.value)} inputMode={key === "barcode" || key === "piecesPerCase" ? "numeric" : undefined} placeholder="—" className={inputClass} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 border-t border-olive-100 px-4 py-3">
              <button type="button" onClick={apply} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-olive-800"><Check className="h-4 w-4" /> Yes, fill it in</button>
              <button type="button" onClick={() => setShowPopup(false)} className="rounded-lg border border-olive-200 px-4 py-2.5 text-sm text-olive-700 hover:bg-olive-50">No</button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
