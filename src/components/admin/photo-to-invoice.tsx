"use client";

import { useRef, useState } from "react";
import { Camera, Check, ImagePlus, Sparkles, X } from "lucide-react";

import type { InvoiceLineInput } from "@/components/admin/previous-items";

interface CatMatch { name: string; sku: string; priceCents: number | null; priceSource?: "last" | "catalog"; packSize: string; imageUrl: string | null; slug: string }
interface Identified { name?: string; brand?: string; size?: string; barcode?: string; categorySlug?: string; piecesPerCase?: number | null; suggestedSku?: string }
interface Item { identified: Identified; match: CatMatch | null; alternatives: CatMatch[] }

const money = (c: number | null | undefined) => (c != null ? `$${(c / 100).toFixed(2)}` : "—");
const inputCls = "h-9 w-full rounded-lg border border-olive-200 px-2 text-sm focus:border-olive-500 focus:outline-none";

export function PhotoToInvoice({
  customerId,
  categories,
  onAddLine,
}: {
  customerId: string | null;
  categories: { slug: string; name: string }[];
  onAddLine: (line: InvoiceLineInput) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  const [view, setView] = useState<"confirm" | "alts" | "new">("confirm");
  const [added, setAdded] = useState(0);
  const [np, setNp] = useState({ name: "", brand: "", size: "", categorySlug: "", piecesPerCase: "", sku: "", barcode: "", price: "" });
  const [creating, setCreating] = useState(false);

  const current = queue[0] ?? null;

  const onPick = async (files: FileList | null) => {
    const arr = Array.from(files ?? []).slice(0, 4);
    if (arr.length === 0) return;
    filesRef.current = arr;
    setBusy(true);
    setNote(null);
    try {
      const fd = new FormData();
      if (customerId) fd.append("customerId", customerId);
      arr.forEach((f) => fd.append("image", f));
      const data = await (await fetch("/admin/invoices/photo-identify", { method: "POST", body: fd })).json();
      if (data.configured === false) { setNote("Photo identify needs an ANTHROPIC_API_KEY."); return; }
      const items: Item[] = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) { setNote("Couldn't identify anything in the photo."); return; }
      setQueue(items);
      setView("confirm");
      setAdded(0);
    } catch {
      setNote("Couldn't reach the identifier — try again.");
    } finally {
      setBusy(false);
    }
  };

  const advance = () => { setQueue((q) => q.slice(1)); setView("confirm"); };

  const addMatch = (m: CatMatch) => {
    onAddLine({ description: m.name, quantity: 1, unitPriceCents: m.priceCents ?? 0 });
    setAdded((a) => a + 1);
    advance();
  };

  const startNew = () => {
    const id = current!.identified;
    setNp({
      name: id.name ?? "", brand: id.brand ?? "", size: id.size ?? "",
      categorySlug: categories.some((c) => c.slug === id.categorySlug) ? id.categorySlug ?? "" : "",
      piecesPerCase: id.piecesPerCase != null ? String(id.piecesPerCase) : "",
      sku: id.suggestedSku ?? "", barcode: id.barcode ?? "", price: "",
    });
    setView("new");
  };

  const createNew = async () => {
    if (!(parseFloat(np.price) > 0)) { setNote("A price is required to add a new product."); return; }
    setCreating(true);
    setNote(null);
    try {
      const fd = new FormData();
      fd.append("name", np.name); fd.append("brand", np.brand); fd.append("size", np.size);
      fd.append("categorySlug", np.categorySlug); fd.append("unitsPerCase", np.piecesPerCase);
      fd.append("sku", np.sku); fd.append("barcode", np.barcode); fd.append("price", np.price);
      if (filesRef.current[0]) fd.append("image", filesRef.current[0]);
      const data = await (await fetch("/admin/invoices/photo-product", { method: "POST", body: fd })).json();
      if (!data.ok) { setNote("Couldn't create the product — try again."); return; }
      onAddLine({ description: data.name, quantity: 1, unitPriceCents: data.priceCents ?? 0 });
      setAdded((a) => a + 1);
      advance();
    } catch {
      setNote("Couldn't create the product — try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-olive-300 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50 disabled:opacity-60">
        <Camera className="h-4 w-4" /> {busy ? "Reading…" : "From photo"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void onPick(e.target.files); e.target.value = ""; }} />
      {note && !current ? <p className="mt-1 text-right text-xs text-olive-500">{note}</p> : null}

      {current ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setQueue([])}>
          <div className="mt-2 w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-olive-100 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 font-display text-lg text-olive-900"><Sparkles className="h-5 w-5 text-olive-700" /> {view === "new" ? "New product" : "Is this the item?"}</h3>
              <span className="text-xs text-olive-500">{queue.length} left</span>
            </div>

            <div className="px-4 py-3">
              <p className="mb-2 text-xs text-olive-500">Seen: <span className="text-olive-700">{[current.identified.name, current.identified.size].filter(Boolean).join(" · ") || "item"}</span></p>

              {view === "confirm" ? (
                <>
                  {current.match ? (
                    <div className="flex gap-3 rounded-lg border border-olive-100 p-3">
                      {current.match.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={current.match.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-olive-100 object-cover" />
                      ) : <div className="h-16 w-16 shrink-0 rounded-lg border border-dashed border-olive-200" />}
                      <div className="min-w-0">
                        <p className="font-medium text-olive-900">{current.match.name}</p>
                        <p className="text-xs text-olive-500">{[current.match.packSize, current.match.sku ? `SKU ${current.match.sku}` : ""].filter(Boolean).join(" · ")}</p>
                        <p className="mt-1 text-sm font-semibold text-olive-900">{money(current.match.priceCents)} <span className="text-[11px] font-normal text-olive-400">{current.match.priceSource === "last" ? "last paid" : "catalog"}</span></p>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No catalog match — this looks new.</p>
                  )}

                  <div className="mt-3 flex flex-col gap-2">
                    {current.match ? (
                      <button type="button" onClick={() => addMatch(current.match!)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-olive-900 py-2.5 text-sm font-semibold text-white hover:bg-olive-800"><Check className="h-4 w-4" /> Yes, add it</button>
                    ) : null}
                    {current.alternatives.length ? (
                      <button type="button" onClick={() => setView("alts")} className="rounded-xl border border-olive-200 py-2.5 text-sm font-medium text-olive-700 hover:bg-olive-50">Other matches ({current.alternatives.length})</button>
                    ) : null}
                    <button type="button" onClick={startNew} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-olive-300 py-2.5 text-sm font-medium text-olive-800 hover:bg-olive-50"><ImagePlus className="h-4 w-4" /> It&apos;s a new product</button>
                    <button type="button" onClick={advance} className="rounded-xl py-2 text-sm text-olive-500 hover:text-olive-800">Skip</button>
                  </div>
                </>
              ) : view === "alts" ? (
                <div className="flex flex-col gap-2">
                  {current.alternatives.map((a) => (
                    <button key={a.sku || a.name} type="button" onClick={() => addMatch(a)} className="flex items-center gap-3 rounded-lg border border-olive-100 p-2 text-left hover:bg-olive-50">
                      {a.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={a.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md border border-olive-100 object-cover" />
                      ) : <div className="h-12 w-12 shrink-0 rounded-md border border-dashed border-olive-200" />}
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-olive-900">{a.name}</span><span className="block truncate text-xs text-olive-500">{a.sku ? `SKU ${a.sku}` : ""} · {money(a.priceCents)}</span></span>
                    </button>
                  ))}
                  <button type="button" onClick={() => setView("confirm")} className="rounded-xl py-2 text-sm text-olive-500 hover:text-olive-800">← Back</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-olive-500">Saved hidden &amp; flagged &ldquo;Needs review&rdquo;; approve it on Products later.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="Name" className={`${inputCls} col-span-2`} />
                    <input value={np.brand} onChange={(e) => setNp({ ...np, brand: e.target.value })} placeholder="Brand" className={inputCls} />
                    <input value={np.size} onChange={(e) => setNp({ ...np, size: e.target.value })} placeholder="Size" className={inputCls} />
                    <select value={np.categorySlug} onChange={(e) => setNp({ ...np, categorySlug: e.target.value })} className={inputCls}>
                      <option value="">Category…</option>
                      {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                    <input value={np.piecesPerCase} onChange={(e) => setNp({ ...np, piecesPerCase: e.target.value })} inputMode="numeric" placeholder="Pcs/case" className={inputCls} />
                    <input value={np.sku} onChange={(e) => setNp({ ...np, sku: e.target.value })} placeholder="SKU" className={inputCls} />
                    <input value={np.barcode} onChange={(e) => setNp({ ...np, barcode: e.target.value })} inputMode="numeric" placeholder="Barcode" className={inputCls} />
                    <div className="relative col-span-2">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-olive-400">$</span>
                      <input value={np.price} onChange={(e) => setNp({ ...np, price: e.target.value })} inputMode="decimal" placeholder="Price (required)" className={`${inputCls} pl-6`} />
                    </div>
                  </div>
                  {note ? <p className="text-xs text-red-600">{note}</p> : null}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setView("confirm")} className="flex-1 rounded-xl border border-olive-200 py-2.5 text-sm text-olive-700 hover:bg-olive-50">Back</button>
                    <button type="button" onClick={() => void createNew()} disabled={creating} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-olive-900 py-2.5 text-sm font-semibold text-white hover:bg-olive-800 disabled:opacity-50"><Check className="h-4 w-4" /> {creating ? "Creating…" : "Create & add"}</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-olive-100 px-4 py-2 text-xs text-olive-500">
              <span>{added} added</span>
              <button type="button" onClick={() => setQueue([])} className="inline-flex items-center gap-1 hover:text-olive-800"><X className="h-3.5 w-3.5" /> Done</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
