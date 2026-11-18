"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Merge, Undo2, X } from "lucide-react";

interface Member {
  slug: string; name: string; brand: string | null; imageUrl: string | null;
  size: string | null; priceCents: number | null; invoiceCount: number;
}
interface Group { key: string; members: Member[] }
interface RecentMerge { id: string; survivorSlug: string; count: number; when: string; undone: boolean }

const money = (c: number | null) => (c == null ? "On request" : `$${(c / 100).toFixed(2)}`);

export function DuplicateCleanup({ groups, total, recent }: { groups: Group[]; total: number; recent: RecentMerge[] }) {
  const router = useRouter();
  const [survivors, setSurvivors] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((g) => [g.key, g.members[0].slug])));
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (payload: Record<string, unknown>, busyKey: string) => {
    setBusy(busyKey);
    try {
      await fetch("/admin/products/duplicates/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      router.refresh();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const merge = (g: Group, asSizes: boolean) => {
    const survivorSlug = survivors[g.key];
    const losers = g.members.filter((m) => m.slug !== survivorSlug).map((m) => m.name);
    const verb = asSizes ? "Make the other sizes of" : "Merge the others into";
    if (!window.confirm(`${verb} “${g.members.find((m) => m.slug === survivorSlug)?.name}”? This moves ${losers.length} product(s) in and can be undone.`)) return;
    void act({ action: "merge", survivorSlug, slugs: g.members.map((m) => m.slug) }, g.key);
  };

  return (
    <div>
      {recent.length ? (
        <div className="mb-5 rounded-xl border border-olive-100 bg-olive-50/40 p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-olive-500 uppercase">Recent merges</p>
          <ul className="space-y-1 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="text-olive-700">{r.count} merged into <span className="font-medium">{r.survivorSlug}</span> · {r.when}{r.undone ? " · undone" : ""}</span>
                {!r.undone ? (
                  <button type="button" disabled={busy === r.id} onClick={() => void act({ action: "undo", logId: r.id }, r.id)} className="inline-flex items-center gap-1 text-xs font-medium text-olive-600 underline hover:text-olive-900 disabled:opacity-50">
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-olive-200 bg-white p-10 text-center text-olive-500">
          No possible duplicates found. Nice and tidy.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-olive-600">{total} look-alike group{total === 1 ? "" : "s"}{total > groups.length ? ` · showing the first ${groups.length}` : ""}. Pick which product survives, then merge — or mark the group as not duplicates.</p>
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.key} className="rounded-xl border border-olive-100 bg-white p-4">
                <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {g.members.map((m) => (
                    <label key={m.slug} className={`flex cursor-pointer gap-3 rounded-lg border p-2.5 ${survivors[g.key] === m.slug ? "border-olive-800 bg-olive-50/60" : "border-olive-100 hover:bg-olive-50/40"}`}>
                      <input type="radio" name={`survivor-${g.key}`} checked={survivors[g.key] === m.slug} onChange={() => setSurvivors((s) => ({ ...s, [g.key]: m.slug }))} className="mt-1 h-4 w-4 shrink-0 accent-olive-800" />
                      {m.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded object-contain" />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-amber-50 text-[10px] text-amber-700">none</span>
                      )}
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium text-olive-900">{m.name}</span>
                        <span className="block text-xs text-olive-500">{[m.brand, m.size].filter(Boolean).join(" · ") || "—"}</span>
                        <span className="block text-xs text-olive-600">{money(m.priceCents)} · {m.invoiceCount} invoice{m.invoiceCount === 1 ? "" : "s"}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy === g.key} onClick={() => merge(g, false)} className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-50">
                    <Merge className="h-4 w-4" /> Merge into one
                  </button>
                  <button type="button" disabled={busy === g.key} onClick={() => merge(g, true)} className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 px-3 py-1.5 text-sm font-medium text-olive-700 hover:bg-olive-50 disabled:opacity-50">
                    <Layers className="h-4 w-4" /> Make sizes of one
                  </button>
                  <button type="button" disabled={busy === g.key} onClick={() => void act({ action: "dismiss", key: g.key }, g.key)} className="ml-auto inline-flex items-center gap-1.5 text-sm text-olive-500 hover:text-olive-800 disabled:opacity-50">
                    <X className="h-4 w-4" /> Not duplicates
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
