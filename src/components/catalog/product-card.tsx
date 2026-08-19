import Link from "next/link";

import { AddToQuote } from "@/components/cart/add-to-quote";
import { ProductImage } from "@/components/catalog/product-image";
import { Badge } from "@/components/ui/badge";
import {
  isOnSale,
  lowestPricedVariant,
  type Product,
} from "@/lib/catalog/types";
import { formatPriceOrRequest } from "@/lib/utils";

export function ProductCard({ product }: { product: Product }) {
  const cheapest = lowestPricedVariant(product);
  const priced = cheapest.retailPriceCents !== null;
  const hasRange = product.variants.length > 1;

  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-olive-100 bg-white transition-shadow hover:shadow-lg hover:shadow-olive-900/5">
      <Link href={`/shop/${product.slug}`} className="relative block">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="aspect-square w-full border-b border-olive-50"
        />
        {product.ribbon ? (
          <Badge ribbon={product.ribbon} className="absolute top-3 left-3" />
        ) : null}
      </Link>

      {/* Fixed-height rows keep the category, name, price, and button aligned
          across every card regardless of how long the product name is. */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="eyebrow truncate">{product.categoryName}</p>
        <h3 className="mt-1.5 min-h-[2.6rem] text-sm leading-snug sm:min-h-[2.9rem] sm:text-base">
          <Link
            href={`/shop/${product.slug}`}
            className="line-clamp-2 text-olive-900 hover:underline"
          >
            {product.name}
          </Link>
        </h3>

        <div className="mt-3 flex min-h-6 items-baseline gap-2">
          {priced ? (
            <>
              <span className="text-base font-semibold text-olive-900">
                {hasRange ? "From " : ""}
                {formatPriceOrRequest(cheapest.retailPriceCents)}
              </span>
              {isOnSale(cheapest) ? (
                <span className="text-sm text-olive-500 line-through">
                  {formatPriceOrRequest(cheapest.compareAtPriceCents)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-sm font-medium text-olive-600">
              Price on request
            </span>
          )}
        </div>

        <div className="mt-auto pt-4">
          {hasRange ? (
            <Link
              href={`/shop/${product.slug}`}
              className="inline-flex h-9 w-full items-center justify-center rounded-full border border-olive-300 bg-white px-4 text-sm font-medium text-olive-900 transition-colors hover:border-olive-500 hover:bg-olive-50"
            >
              Choose an option ({product.variants.length})
            </Link>
          ) : (
            <AddToQuote
              product={{
                slug: product.slug,
                name: product.name,
                variants: product.variants,
              }}
              layout="compact"
            />
          )}
        </div>
      </div>
    </article>
  );
}
