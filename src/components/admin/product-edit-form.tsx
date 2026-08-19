"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { saveProduct } from "@/app/admin/actions";
import { idleFormState } from "@/lib/form";

interface Variant {
  sku: string;
  name: string;
  retailPriceCents: number | null;
}
interface ProductData {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  origin: string | null;
  ribbon: string | null;
  isFeatured: boolean;
  isActive: boolean;
  categorySlug: string;
  variants: Variant[];
}

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-lg bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function ProductEditForm({
  product,
  categories,
  countries,
  suggestedImageUrl,
}: {
  product: ProductData;
  categories: { slug: string; name: string }[];
  countries: string[];
  suggestedImageUrl: string | null;
}) {
  const [state, action] = useActionState(saveProduct, idleFormState);
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");
  const searchHref = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(product.name)}`;

  return (
    <form action={action} className="space-y-6 rounded-xl border border-olive-100 bg-white p-6">
      <input type="hidden" name="slug" value={product.slug} />

      {/* Image */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="imageUrl" className="text-sm font-medium text-olive-800">
            Image
          </label>
          <a href={searchHref} target="_blank" rel="noreferrer" className="text-xs font-medium text-olive-700 hover:underline">
            Search images ↗
          </a>
        </div>
        <div className="flex gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-olive-100 bg-olive-50">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] text-olive-400">no image</span>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              id="imageUrl"
              name="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Paste an image URL (it will be saved to the store)…"
              className={inputClass}
            />
            {suggestedImageUrl && suggestedImageUrl !== imageUrl ? (
              <div className="flex items-center gap-2 rounded-lg bg-olive-50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={suggestedImageUrl} alt="" className="h-10 w-10 rounded object-contain" />
                <span className="text-xs text-olive-600">Suggested image found online.</span>
                <button
                  type="button"
                  onClick={() => setImageUrl(suggestedImageUrl)}
                  className="ml-auto rounded-md border border-olive-300 px-2.5 py-1 text-xs hover:bg-white"
                >
                  Use this
                </button>
              </div>
            ) : null}
            {imageUrl ? (
              <button type="button" onClick={() => setImageUrl("")} className="text-xs text-olive-500 hover:text-red-700">
                Remove image
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Name / description */}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-olive-800">
          Name
        </label>
        <input id="name" name="name" defaultValue={product.name} className={inputClass} />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-olive-800">
          Description
        </label>
        <textarea id="description" name="description" defaultValue={product.description} rows={4} className={`${inputClass} h-auto py-2`} />
      </div>

      {/* Category / origin / ribbon */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="categorySlug" className="mb-1 block text-sm font-medium text-olive-800">
            Category
          </label>
          <select id="categorySlug" name="categorySlug" defaultValue={product.categorySlug} className={inputClass}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="origin" className="mb-1 block text-sm font-medium text-olive-800">
            Country of origin
          </label>
          <select id="origin" name="origin" defaultValue={product.origin ?? ""} className={inputClass}>
            <option value="">Unspecified</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ribbon" className="mb-1 block text-sm font-medium text-olive-800">
            Ribbon / badge
          </label>
          <input id="ribbon" name="ribbon" defaultValue={product.ribbon ?? ""} placeholder="e.g. Best Seller" className={inputClass} />
        </div>
      </div>

      {/* Variant prices */}
      <div>
        <p className="mb-2 text-sm font-medium text-olive-800">Prices (leave blank for “price on request”)</p>
        <div className="space-y-2">
          {product.variants.map((v) => (
            <div key={v.sku} className="flex items-center gap-3">
              <span className="w-40 text-sm text-olive-600">{v.name}</span>
              <span className="text-sm text-olive-500">$</span>
              <input
                name={`price__${v.sku}`}
                defaultValue={v.retailPriceCents != null ? (v.retailPriceCents / 100).toFixed(2) : ""}
                inputMode="decimal"
                className="h-9 w-28 rounded-lg border border-olive-200 px-3 text-sm"
              />
              <span className="text-xs text-olive-400">{v.sku}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-olive-800">
          <input type="checkbox" name="isActive" defaultChecked={product.isActive} className="h-4 w-4 accent-olive-800" />
          Visible on store
        </label>
        <label className="flex items-center gap-2 text-sm text-olive-800">
          <input type="checkbox" name="isFeatured" defaultChecked={product.isFeatured} className="h-4 w-4 accent-olive-800" />
          Featured (home best-sellers)
        </label>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved.</p>
      ) : null}

      <Save />
    </form>
  );
}
