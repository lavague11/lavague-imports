"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { isOnSale, type Product, type Variant } from "@/lib/catalog/types";
import { cn, formatPriceOrRequest } from "@/lib/utils";

/** Product fields the client actually needs — keeps the payload small. */
export type QuotableProduct = Pick<Product, "slug" | "name" | "variants">;

export function AddToQuote({
  product,
  layout = "full",
}: {
  product: QuotableProduct;
  layout?: "full" | "compact";
}) {
  const { addLine } = useCart();
  const [selectedId, setSelectedId] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const selected: Variant | undefined =
    product.variants.find((variant) => variant.id === selectedId) ??
    product.variants[0];

  if (!selected) return null;

  function handleAdd() {
    if (!selected) return;
    addLine(
      {
        variantId: selected.id,
        sku: selected.sku,
        productSlug: product.slug,
        productName: product.name,
        variantName: selected.name,
        unitPriceCents: selected.retailPriceCents,
      },
      quantity,
    );
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2000);
  }

  if (layout === "compact") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleAdd}
        className="w-full gap-1 px-2 text-xs whitespace-nowrap sm:gap-1.5 sm:text-sm"
      >
        {justAdded ? (
          <>
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Added
          </>
        ) : (
          <>
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Add to quote
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="space-y-5">
      {product.variants.length > 1 ? (
        <div>
          <label htmlFor="variant" className="eyebrow mb-2 block">
            Choose an option ({product.variants.length})
          </label>
          <select
            id="variant"
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
            className="w-full rounded-lg border border-olive-200 bg-white px-3.5 py-2.5 pr-8 text-sm text-olive-900 hover:border-olive-300 focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
          >
            {product.variants.map((variant) => (
              <option key={variant.id} value={variant.id} disabled={!variant.inStock}>
                {variant.name}
                {variant.retailPriceCents != null
                  ? ` — ${formatPriceOrRequest(variant.retailPriceCents)}`
                  : ""}
                {!variant.inStock ? " (out of stock)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-display text-olive-900",
            selected.retailPriceCents === null ? "text-2xl" : "text-3xl",
          )}
        >
          {formatPriceOrRequest(selected.retailPriceCents)}
        </span>
        {isOnSale(selected) ? (
          <span className="text-sm text-olive-500 line-through">
            {formatPriceOrRequest(selected.compareAtPriceCents)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-full border border-olive-200">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-11 w-11 rounded-l-full text-lg text-olive-700 hover:bg-olive-50"
          >
            −<span className="sr-only">Decrease quantity</span>
          </button>
          <label className="sr-only" htmlFor="quantity">
            Quantity
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.max(1, Number(event.target.value) || 1))
            }
            className="h-11 w-14 border-x border-olive-200 text-center text-sm text-olive-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="h-11 w-11 rounded-r-full text-lg text-olive-700 hover:bg-olive-50"
          >
            +<span className="sr-only">Increase quantity</span>
          </button>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={handleAdd}
          disabled={!selected.inStock}
          className="flex-1 sm:flex-none"
        >
          {justAdded ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" /> Added to quote list
            </>
          ) : (
            "Add to quote list"
          )}
        </Button>
      </div>

      <p className="text-xs text-olive-600" aria-live="polite">
        {selected.inStock
          ? "No payment is taken online. We reply with a firm quote, freight, and lead time — usually the same business day."
          : "Currently out of stock. Add it to your quote list and we'll tell you the next arrival date."}
      </p>
    </div>
  );
}
