"use client";

import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Minus, Pencil, Plus } from "lucide-react";

export interface ReorderItem {
  slug: string;
  name: string;
  size: string;
  imageUrl: string | null;
  lastQty: number;
  suggested: boolean;
}

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
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (dir: number) => scroller.current?.scrollBy({ left: dir * 340, behavior: "smooth" });

  return (
    <section className="mt-6 rounded-xl border border-olive-100 bg-olive-50/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-olive-900">Reorder your items</h2>
        <div className="flex items-center gap-2">
          <div className="hidden gap-1 sm:flex">
            <button type="button" onClick={() => nudge(-1)} aria-label="Scroll left" className="flex h-8 w-8 items-center justify-center rounded-full border border-olive-200 bg-white text-olive-700 hover:bg-olive-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => nudge(1)} aria-label="Scroll right" className="flex h-8 w-8 items-center justify-center rounded-full border border-olive-200 bg-white text-olive-700 hover:bg-olive-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <form action="/wholesale/order/reorder" method="post">
            <button className="rounded-full bg-olive-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-olive-800">Reorder all</button>
          </form>
        </div>
      </div>

      <div
        ref={scroller}
        className="mt-3 flex snap-x gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
      >
        {items.map((it) => (
          <ReorderCard key={it.slug} item={it} inCart={cart[it.slug] ?? 0} addAction={addAction} from={from} />
        ))}
      </div>
      <p className="mt-2 text-xs text-olive-500">Swipe to see more — from your past orders at your last quantities. No prices; we quote each request.</p>
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
    <div className="relative flex w-36 shrink-0 snap-start flex-col rounded-xl border border-olive-100 bg-white p-2.5">
      {item.suggested ? (
        <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">Suggested</span>
      ) : null}

      {!open && !inCart ? (
        <button
          type="button"
          onClick={openStepper}
          aria-label={`Add ${item.name}`}
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-olive-900 text-white shadow hover:bg-olive-800"
        >
          <Plus className="h-4 w-4" />
        </button>
      ) : null}

      {item.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={item.imageUrl} alt="" className="mx-auto h-16 w-16 shrink-0 rounded-lg object-contain" />
      ) : (
        <span className="mx-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-olive-50 text-[9px] text-olive-400">no photo</span>
      )}

      <p className="mt-1.5 line-clamp-2 text-xs font-medium text-olive-900">{item.name}</p>
      {item.size ? <p className="mt-0.5 text-[11px] text-olive-500">{item.size}</p> : null}

      <div className="mt-auto pt-1.5">
        {open ? (
          <form action={addAction} method="post" className="space-y-1.5">
            <input type="hidden" name="slug" value={item.slug} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="cases" value={qty} />
            <div className="flex items-center justify-center gap-1.5">
              <button type="button" onClick={() => setQty((n) => Math.max(0, n - 1))} aria-label="Fewer" className="flex h-7 w-7 items-center justify-center rounded-lg border border-olive-200 text-olive-700 hover:bg-olive-50">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[2ch] text-center text-sm font-semibold text-olive-900">{qty}</span>
              <button type="button" onClick={() => setQty((n) => Math.min(9999, n + 1))} aria-label="More" className="flex h-7 w-7 items-center justify-center rounded-lg border border-olive-200 text-olive-700 hover:bg-olive-50">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-1">
              <button type="submit" className="flex-1 rounded-lg bg-olive-900 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-olive-800">{inCart ? "Update" : "Confirm"}</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="rounded-lg border border-olive-200 px-2 py-1.5 text-[11px] text-olive-600 hover:bg-olive-50">✕</button>
            </div>
          </form>
        ) : inCart ? (
          <div className="flex items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <Check className="h-3 w-3" /> In request · {inCart}
            </span>
            <button type="button" onClick={openStepper} aria-label="Edit quantity" className="text-olive-400 hover:text-olive-800">
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
