"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreVertical, Trash2, X } from "lucide-react";

import { quickUpdateProduct } from "@/app/admin/actions";
import { StatusSelect } from "@/components/admin/status-select";

export interface MobileProductItem {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  brand: string | null;
  origin: string | null;
  imageUrl: string | null;
  priceLabel: string;
  priceDollars: string; // primary variant price as "12.50" or "" (on request)
  sku: string;
  active: boolean;
  needsReview: boolean;
  isCustom: boolean;
  isFragile: boolean;
  unpublished: boolean;
}

/**
 * Mobile product list (PRODUCTS_UI §8): cards, never the desktop table. Tap a
 * card to edit; long-press for a quick sheet (price · show/hide · save); the "…"
 * menu holds Duplicate and Delete. Checkboxes appear only in Select mode so the
 * shared #bulk bar can act on them.
 */
export function MobileProductList({ items }: { items: MobileProductItem[] }) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<MobileProductItem | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startPress = (item: MobileProductItem) => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setSheetFor(item);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const openCard = (item: MobileProductItem) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (selectMode) return;
    router.push(`/admin/products/${item.slug}`);
  };

  return (
    <div className="lg:hidden">
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setSelectMode((s) => !s)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${selectMode ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
        >
          {selectMode ? "Done" : "Select"}
        </button>
      </div>

      <div className="divide-y divide-olive-50 overflow-hidden rounded-xl border border-olive-100 bg-white">
        {items.map((p) => (
          <div
            key={p.id}
            onClick={() => openCard(p)}
            onTouchStart={() => startPress(p)}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            className={`flex items-center gap-3 p-3 ${p.active ? "" : "bg-olive-50/40"}`}
          >
            {selectMode ? (
              <input
                type="checkbox"
                name="slug"
                value={p.slug}
                form="bulk"
                data-bulk="1"
                aria-label={`Select ${p.name}`}
                onClick={(e) => e.stopPropagation()}
                className="h-5 w-5 shrink-0 accent-olive-800"
              />
            ) : null}

            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
            ) : (
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded bg-amber-50 text-[10px] font-medium text-amber-700">none</span>
            )}

            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-olive-900">{p.name}</p>
              <p className="truncate text-xs text-olive-500">{p.brand ? `${p.brand} · ` : ""}{p.categoryName}{p.origin ? ` · ${p.origin}` : ""}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-olive-700">{p.priceLabel}</span>
                {p.needsReview ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">review</span> : null}
                {p.unpublished ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">unpublished</span> : null}
                {!p.active ? <span className="rounded bg-olive-100 px-1.5 py-0.5 text-[10px] text-olive-600">hidden</span> : null}
                {p.isFragile ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">fragile</span> : null}
              </div>
            </div>

            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <StatusSelect slug={p.slug} active={p.active} />
            </div>

            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMenuFor((m) => (m === p.id ? null : p.id))}
                aria-label="More actions"
                className="rounded-full p-1.5 text-olive-500 hover:bg-olive-50"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuFor === p.id ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                  <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-lg border border-olive-100 bg-white py-1 shadow-lg">
                    <form method="post" action={`/admin/products/${p.slug}/duplicate`}>
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-olive-700 hover:bg-olive-50">
                        <Copy className="h-4 w-4" /> Duplicate
                      </button>
                    </form>
                    <form
                      method="post"
                      action={`/admin/products/${p.slug}/delete`}
                      onSubmit={(e) => { if (!window.confirm(`Delete “${p.name}”? This can't be undone.`)) e.preventDefault(); }}
                    >
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </form>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Long-press quick sheet */}
      {sheetFor ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={() => setSheetFor(null)}>
          <div className="w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="line-clamp-1 font-medium text-olive-900">{sheetFor.name}</p>
              <button type="button" onClick={() => setSheetFor(null)} aria-label="Close" className="rounded-full p-1 text-olive-500 hover:bg-olive-50"><X className="h-5 w-5" /></button>
            </div>
            <form action={quickUpdateProduct} onSubmit={() => setSheetFor(null)}>
              <input type="hidden" name="slug" value={sheetFor.slug} />
              <input type="hidden" name="sku" value={sheetFor.sku} />
              <label className="mb-1 block text-xs font-medium text-olive-600">Price each (USD)</label>
              <input name="price" defaultValue={sheetFor.priceDollars} inputMode="decimal" placeholder="On request" className="h-11 w-full rounded-lg border border-olive-200 px-3 text-base focus:border-olive-500 focus:outline-none placeholder:text-olive-300" />
              <label className="mt-3 flex items-center gap-2 text-sm text-olive-800">
                <input type="checkbox" name="active" defaultChecked={sheetFor.active} className="h-5 w-5 accent-olive-800" /> Visible on store
              </label>
              <button className="mt-4 h-12 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">Save</button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
