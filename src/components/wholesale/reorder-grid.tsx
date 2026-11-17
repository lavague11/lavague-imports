"use client";

import { useState } from "react";
import { Check, Minus, Pencil, Plus, Shuffle } from "lucide-react";

export interface ReorderItem {
  slug: string;
  name: string;
  size: string;
  imageUrl: string | null;
  lastQty: number;
  suggested: boolean;
}

const WINDOW = 8;

export function ReorderGrid({
  items,
  cart,
  addAction = "/wholesale/order/add",
  from = "/wholesale/order",
}: {
  items: ReorderItem[];
  cart: Record<string, number>;
  addAction?: string;
  from?: string;
}) {
  const [offset, setOffset] = useState(0);
  const canShuffle = items.length > WINDOW;
  const windowItems = canShuffle
    ? Array.from({ length: WINDOW }, (_, i) => items[(offset + i) % items.length])
    : items;

  return (
    <section className="mt-6 rounded-xl border border-olive-100 bg-olive-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-olive-900">Reorder your items</h2>
        <div className="flex items-center gap-2">
          {canShuffle ? (
            <button
              type="button"
              onClick={() => setOffset((o) => (o + WINDOW) % items.length)}
              className="inline-flex items-center gap-1.5 rounded-full border border-olive-200 bg-white px-3 py-1.5 text-xs font-medium text-olive-700 hover:bg-olive-50"
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </button>
          ) : null}
          <form action="/wholesale/order/reorder" method="post">
            <button className="rounded-full bg-olive-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-olive-800">Reorder all</button>
          </form>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {windowItems.map((it) => (
          <ReorderCard key={it.slug} item={it} inCart={cart[it.slug] ?? 0} addAction={addAction} from={from} />
        ))}
      </div>
      <p className="mt-2 text-xs text-olive-500">From your past orders at your last quantities. No prices — we quote each request.</p>
    </section>
  );
}

function ReorderCard({ item, inCart, addAction, from }: { item: ReorderItem; inCart: number; addAction: string; from: string }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(inCart || item.lastQty || 1);

  const openStepper = () => {
    setQty(inCart || item.lastQty || 1);
    setOpen(true);
  };

  return (
    <div className="relative flex flex-col rounded-xl border border-olive-100 bg-white p-3">
      {item.suggested ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Suggested</span>
      ) : null}

      {!open && !inCart ? (
        <button
          type="button"
          onClick={openStepper}
          aria-label={`Add ${item.name}`}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-olive-900 text-white shadow hover:bg-olive-800"
        >
          <Plus className="h-4 w-4" />
        </button>
      ) : null}

      {item.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={item.imageUrl} alt="" className="mx-auto h-20 w-20 shrink-0 rounded-lg object-contain" />
      ) : (
        <span className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-olive-50 text-[10px] text-olive-400">no photo</span>
      )}

      <p className="mt-2 line-clamp-2 text-sm font-medium text-olive-900">{item.name}</p>
      {item.size ? <p className="mt-0.5 text-xs text-olive-500">{item.size}</p> : null}

      <div className="mt-2">
        {open ? (
          <form action={addAction} method="post" className="space-y-2">
            <input type="hidden" name="slug" value={item.slug} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="cases" value={qty} />
            <p className="text-xs font-medium text-olive-700">How many cases?</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQty((n) => Math.max(0, n - 1))} aria-label="Fewer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-olive-200 text-olive-700 hover:bg-olive-50">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[2ch] text-center text-sm font-semibold text-olive-900">{qty}</span>
              <button type="button" onClick={() => setQty((n) => Math.min(9999, n + 1))} aria-label="More" className="flex h-8 w-8 items-center justify-center rounded-lg border border-olive-200 text-olive-700 hover:bg-olive-50">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1.5">
              <button type="submit" className="flex-1 rounded-lg bg-olive-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-olive-800">{inCart ? "Update" : "Confirm"}</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-olive-200 px-3 py-1.5 text-xs text-olive-600 hover:bg-olive-50">Cancel</button>
            </div>
          </form>
        ) : inCart ? (
          <div className="flex items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" /> In request · {inCart}
            </span>
            <button type="button" onClick={openStepper} aria-label="Edit quantity" className="text-olive-400 hover:text-olive-800">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
