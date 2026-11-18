"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Images, Scissors, Sparkles } from "lucide-react";

import { nameKey } from "@/lib/clean-name";
import { UNIT_OPTIONS, formatUnitSize } from "@/lib/units";

interface Suggestion {
  name?: string; brand?: string; categorySlug?: string; origin?: string;
  unitSizeAmount?: string; unitSizeUnit?: string; piecesPerCase?: number | null; piecesPerCaseGuess?: number | null;
  suggestedSku?: string; description?: string; fragile?: boolean; photoScore?: number; photoNotes?: string;
}
interface Item {
  id: string; file: File; preview: string;
  status: "queued" | "identifying" | "done" | "error";
  score: number | null; notes: string; s: Suggestion | null;
}
type Tag = "strong" | "possible" | "none";
type Level = "likely-duplicate" | "related-variant" | "possible" | "none";
interface MatchInfo { tag: Tag; level?: Level; match: { slug: string; name: string; brand: string | null } | null; alternatives: { slug: string; name: string; brand: string | null }[] }
const LEVEL_META: Record<Level, { label: string; cls: string }> = {
  "likely-duplicate": { label: "Likely duplicate", cls: "bg-red-100 text-red-700" },
  "related-variant": { label: "Related variant", cls: "bg-amber-100 text-amber-800" },
  possible: { label: "Possible match", cls: "bg-amber-100 text-amber-800" },
  none: { label: "Needs review", cls: "bg-olive-100 text-olive-600" },
};
interface Draft {
  name: string; brand: string; categorySlug: string; origin: string;
  sizeAmount: string; sizeUnit: string; unitsPerCase: string; price: string; description: string; fragile: boolean; sku: string;
}
interface Group {
  id: string; itemIds: string[]; mainId: string; draft: Draft; match: MatchInfo | null; useExisting: boolean;
  saveStatus: "" | "saving" | "saved" | "error" | "skipped"; savedSlug?: string;
}

const scoreChip = (score: number | null) => {
  if (score == null) return "bg-olive-100 text-olive-500";
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 55) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
};
const uid = () => Math.random().toString(36).slice(2, 9);

export function BulkAdd({ categories, brands, countries }: { categories: { slug: string; name: string }[]; brands: string[]; countries: string[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"upload" | "processing" | "review" | "done">("upload");
  const [items, setItems] = useState<Record<string, Item>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [saveProg, setSaveProg] = useState({ done: 0, total: 0 });
  const [scoreOpen, setScoreOpen] = useState<string | null>(null);

  const draftFromItem = (it: Item): Draft => {
    const s = it.s ?? {};
    return {
      name: s.name ?? "", brand: s.brand ?? "", categorySlug: categories.some((c) => c.slug === s.categorySlug) ? s.categorySlug! : "",
      origin: s.origin ?? "", sizeAmount: s.unitSizeAmount ?? "", sizeUnit: UNIT_OPTIONS.some((u) => u.value === s.unitSizeUnit) ? s.unitSizeUnit! : "",
      unitsPerCase: s.piecesPerCase != null ? String(s.piecesPerCase) : s.piecesPerCaseGuess != null ? String(s.piecesPerCaseGuess) : "",
      price: "", description: s.description ?? "", fragile: !!s.fragile, sku: s.suggestedSku ?? "",
    };
  };

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    const list: Item[] = files.slice(0, 60).map((f) => ({ id: uid(), file: f, preview: URL.createObjectURL(f), status: "queued", score: null, notes: "", s: null }));
    const results: Record<string, Item> = {};
    list.forEach((i) => (results[i.id] = i));
    setItems({ ...results });
    setProgress({ done: 0, total: list.length });
    setPhase("processing");

    // Identify with limited concurrency; one failure never blocks the rest.
    let done = 0;
    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift()!;
        results[it.id] = { ...results[it.id], status: "identifying" };
        setItems((p) => ({ ...p, [it.id]: results[it.id] }));
        try {
          const fd = new FormData();
          fd.append("image", it.file);
          const res = await fetch("/admin/products/identify", { method: "POST", body: fd });
          const data = await res.json();
          const s: Suggestion | null = data.suggestion ?? null;
          results[it.id] = { ...results[it.id], status: s ? "done" : "error", s, score: typeof s?.photoScore === "number" ? s.photoScore : null, notes: s?.photoNotes ?? "" };
        } catch {
          results[it.id] = { ...results[it.id], status: "error" };
        }
        setItems((p) => ({ ...p, [it.id]: results[it.id] }));
        done += 1;
        setProgress({ done, total: list.length });
      }
    };
    await Promise.all([worker(), worker()]);

    // Build groups from the final results (no setState-in-updater).
    const identified = Object.values(results).filter((i) => i.s);
    const byKey = new Map<string, Item[]>();
    for (const it of identified) {
      const s = it.s!;
      const size = [s.unitSizeAmount, s.unitSizeUnit].filter(Boolean).join(" ");
      const k = nameKey(s.name ?? it.id, s.brand ?? "", size) || it.id;
      const arr = byKey.get(k) ?? [];
      arr.push(it);
      byKey.set(k, arr);
    }
    const gs: Group[] = [];
    for (const arr of byKey.values()) {
      const main = [...arr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      gs.push({ id: uid(), itemIds: arr.map((i) => i.id), mainId: main.id, draft: draftFromItem(main), match: null, useExisting: false, saveStatus: "" });
    }
    setGroups(gs);
    setPhase("review");
    void checkMatches(gs);
  };

  const checkMatches = async (gs: Group[]) => {
    for (const g of gs) {
      try {
        const res = await fetch("/admin/products/match", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: g.draft.name, brand: g.draft.brand, sku: g.draft.sku, size: formatUnitSize(g.draft.sizeAmount, g.draft.sizeUnit) }),
        });
        const m: MatchInfo = await res.json();
        setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, match: m, useExisting: m.tag === "strong" } : x)));
      } catch {
        /* leave unmatched */
      }
    }
  };

  const setDraft = (gid: string, patch: Partial<Draft>) => setGroups((prev) => prev.map((g) => (g.id === gid ? { ...g, draft: { ...g.draft, ...patch } } : g)));
  const splitItem = (gid: string, itemId: string) =>
    setGroups((prev) => {
      const g = prev.find((x) => x.id === gid);
      if (!g || g.itemIds.length <= 1) return prev;
      const rest = g.itemIds.filter((i) => i !== itemId);
      const it = items[itemId];
      const newG: Group = { id: uid(), itemIds: [itemId], mainId: itemId, draft: it ? draftFromItem(it) : g.draft, match: null, useExisting: false, saveStatus: "" };
      return prev.map((x) => (x.id === gid ? { ...x, itemIds: rest, mainId: rest.includes(x.mainId) ? x.mainId : rest[0] } : x)).concat(newG);
    });
  const mergeInto = (gid: string, targetId: string) =>
    setGroups((prev) => {
      if (gid === targetId) return prev;
      const g = prev.find((x) => x.id === gid);
      if (!g) return prev;
      return prev
        .map((x) => (x.id === targetId ? { ...x, itemIds: [...x.itemIds, ...g.itemIds] } : x))
        .filter((x) => x.id !== gid);
    });
  const setMain = (gid: string, itemId: string) => setGroups((prev) => prev.map((g) => (g.id === gid ? { ...g, mainId: itemId } : g)));

  const saveAll = async () => {
    const toSave = groups.filter((g) => !g.useExisting);
    setSaveProg({ done: 0, total: toSave.length });
    let done = 0;
    for (const g of groups) {
      if (g.useExisting) {
        setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, saveStatus: "skipped" } : x)));
        continue;
      }
      setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, saveStatus: "saving" } : x)));
      try {
        const fd = new FormData();
        const d = g.draft;
        fd.append("name", d.name);
        fd.append("categorySlug", d.categorySlug);
        fd.append("brand", d.brand);
        fd.append("origin", d.origin);
        fd.append("sku", d.sku);
        fd.append("unitSizeAmount", d.sizeAmount);
        fd.append("unitSizeUnit", d.sizeUnit);
        fd.append("unitsPerCase", d.unitsPerCase);
        fd.append("price", d.price);
        fd.append("description", d.description);
        if (d.fragile) fd.append("fragile", "on");
        const ordered = [g.mainId, ...g.itemIds.filter((i) => i !== g.mainId)].slice(0, 3);
        ordered.forEach((iid, idx) => { const it = items[iid]; if (it) fd.append(`imageFile${idx}`, it.file); });
        const res = await fetch("/admin/products/bulk/create", { method: "POST", body: fd });
        const data = await res.json();
        setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, saveStatus: data.ok ? "saved" : "error", savedSlug: data.slug } : x)));
      } catch {
        setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, saveStatus: "error" } : x)));
      }
      done += 1;
      setSaveProg({ done, total: toSave.length });
    }
    setPhase("done");
  };

  // ---- render ----
  if (phase === "upload") {
    return (
      <div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(Array.from(e.target.files ?? []))} />
        <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-olive-200 bg-olive-50/40 py-16 text-olive-600 hover:bg-olive-50">
          <Images className="h-10 w-10 text-olive-400" />
          <span className="text-sm font-medium">Add photos — one or many</span>
          <span className="text-xs text-olive-500">We&apos;ll identify each and group them by product</span>
        </button>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div className="rounded-xl border border-olive-100 bg-white p-6">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-olive-800"><Sparkles className="h-4 w-4 animate-pulse" /> Identifying {progress.done} of {progress.total}…</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-olive-100">
          <div className="h-full bg-olive-700 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </div>
      </div>
    );
  }

  const cat = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const savedCount = groups.filter((g) => g.saveStatus === "saved").length;

  return (
    <div>
      {phase === "done" ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Saved {savedCount} product{savedCount === 1 ? "" : "s"} (hidden · Needs review).{" "}
          <Link href="/admin/products?filter=needs-review" className="font-medium underline">Review them →</Link>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-olive-600">{groups.length} product{groups.length === 1 ? "" : "s"} from {Object.keys(items).length} photos. Edit, split or merge, then save.</p>
          <button type="button" onClick={() => void saveAll()} className="h-10 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800">
            Save all ({groups.filter((g) => !g.useExisting).length})
          </button>
        </div>
      )}

      {phase === "done" && saveProg.total > 0 ? (
        <p className="mb-3 text-xs text-olive-500">{saveProg.done} of {saveProg.total} saved.</p>
      ) : null}

      <div className="space-y-4">
        {groups.map((g) => {
          const level: Level = g.match?.level ?? "none";
          return (
            <div key={g.id} className="rounded-xl border border-olive-100 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_META[level].cls}`}>{LEVEL_META[level].label}</span>
                {g.match?.match ? (
                  <span className="text-xs text-olive-500">
                    matches <Link href={`/admin/products/${g.match.match.slug}`} target="_blank" className="font-medium underline">{g.match.match.name}</Link>
                    <label className="ml-2 inline-flex items-center gap-1 text-olive-700">
                      <input type="checkbox" checked={g.useExisting} onChange={(e) => setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, useExisting: e.target.checked } : x)))} className="h-3.5 w-3.5 accent-olive-800" /> use existing (skip)
                    </label>
                  </span>
                ) : null}
                {g.saveStatus ? <span className="ml-auto text-xs text-olive-500">{g.saveStatus === "saved" ? "✓ saved" : g.saveStatus === "skipped" ? "skipped" : g.saveStatus === "error" ? "⚠ failed" : "saving…"}</span> : null}
              </div>

              {/* Photos */}
              <div className="mb-3 flex flex-wrap gap-2">
                {g.itemIds.map((iid) => {
                  const it = items[iid];
                  if (!it) return null;
                  return (
                    <div key={iid} className="relative h-20 w-20 overflow-hidden rounded-lg border border-olive-100 bg-olive-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.preview} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => setScoreOpen(scoreOpen === iid ? null : iid)} className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[10px] font-semibold ${scoreChip(it.score)}`}>{it.score ?? "–"}</button>
                      {g.mainId === iid ? <span className="absolute bottom-1 left-1 rounded bg-olive-900/85 px-1 text-[9px] font-medium text-white">Main</span> : (
                        <button type="button" onClick={() => setMain(g.id, iid)} className="absolute bottom-1 left-1 rounded bg-white/85 px-1 text-[9px] text-olive-600 hover:text-olive-900">main?</button>
                      )}
                      {g.itemIds.length > 1 ? <button type="button" onClick={() => splitItem(g.id, iid)} title="Split to its own product" className="absolute right-1 top-1 rounded-full bg-white/85 p-0.5 text-olive-500 hover:text-olive-900"><Scissors className="h-3 w-3" /></button> : null}
                      {scoreOpen === iid ? <div className="absolute inset-x-0 bottom-0 z-10 bg-black/75 p-1 text-[9px] text-white">{it.notes || "no notes"}</div> : null}
                    </div>
                  );
                })}
              </div>

              {/* Draft fields */}
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={g.draft.name} onChange={(e) => setDraft(g.id, { name: e.target.value })} placeholder="Name" className="h-9 rounded-lg border border-olive-200 px-2.5 text-sm" />
                <input value={g.draft.brand} onChange={(e) => setDraft(g.id, { brand: e.target.value })} list="bulk-brand-list" placeholder="Brand" className="h-9 rounded-lg border border-olive-200 px-2.5 text-sm" />
                <select value={g.draft.categorySlug} onChange={(e) => setDraft(g.id, { categorySlug: e.target.value })} className="h-9 rounded-lg border border-olive-200 px-2 text-sm">
                  <option value="">Category…</option>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
                <input value={g.draft.origin} onChange={(e) => setDraft(g.id, { origin: e.target.value })} list="bulk-country-list" placeholder="Country" className="h-9 rounded-lg border border-olive-200 px-2.5 text-sm" />
                <div className="flex gap-2">
                  <input value={g.draft.sizeAmount} onChange={(e) => setDraft(g.id, { sizeAmount: e.target.value })} placeholder="Size" className="h-9 w-full rounded-lg border border-olive-200 px-2.5 text-sm" />
                  <select value={g.draft.sizeUnit} onChange={(e) => setDraft(g.id, { sizeUnit: e.target.value })} className="h-9 rounded-lg border border-olive-200 px-2 text-sm">
                    <option value="">unit</option>
                    {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input value={g.draft.unitsPerCase} onChange={(e) => setDraft(g.id, { unitsPerCase: e.target.value })} placeholder="Units/case" className="h-9 w-full rounded-lg border border-olive-200 px-2.5 text-sm" />
                  <input value={g.draft.price} onChange={(e) => setDraft(g.id, { price: e.target.value })} placeholder="Price" className="h-9 w-full rounded-lg border border-olive-200 px-2.5 text-sm" />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-olive-400">
                <span>{cat(g.draft.categorySlug) || "no category"}</span>
                {groups.length > 1 ? (
                  <select value="" onChange={(e) => { if (e.target.value) mergeInto(g.id, e.target.value); }} className="rounded border border-olive-200 px-1.5 py-0.5 text-xs text-olive-600">
                    <option value="">Merge into…</option>
                    {groups.filter((x) => x.id !== g.id).map((x) => <option key={x.id} value={x.id}>{x.draft.name || "untitled"}</option>)}
                  </select>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <datalist id="bulk-brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
      <datalist id="bulk-country-list">{countries.map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  );
}
