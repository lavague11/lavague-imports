"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveProduct } from "@/app/admin/actions";
import { ImageSlots } from "@/components/admin/image-slots";
import { idleFormState } from "@/lib/form";
import { UNIT_OPTIONS, parseUnitSize } from "@/lib/units";

interface Variant {
  sku: string;
  name: string;
  retailPriceCents: number | null;
  unitsPerCase: number | null;
}
interface ProductData {
  slug: string;
  name: string;
  description: string;
  images: string[];
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
}: {
  product: ProductData;
  categories: { slug: string; name: string }[];
  countries: string[];
}) {
  const [state, action] = useActionState(saveProduct, idleFormState);

  return (
    <form action={action} className="space-y-6 rounded-xl border border-olive-100 bg-white p-6">
      <input type="hidden" name="slug" value={product.slug} />

      {/* Images */}
      <ImageSlots initial={product.images} searchName={product.name} />

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
          {/* Pick a known country or type a new one. */}
          <input
            id="origin"
            name="origin"
            list="country-options"
            defaultValue={product.origin ?? ""}
            placeholder="Type or choose…"
            className={inputClass}
          />
          <datalist id="country-options">
            {countries.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="ribbon" className="mb-1 block text-sm font-medium text-olive-800">
            Ribbon / badge
          </label>
          <input id="ribbon" name="ribbon" defaultValue={product.ribbon ?? ""} placeholder="e.g. Best Seller" className={inputClass} />
        </div>
      </div>

      {/* Variants: price, unit size, units per case */}
      <div>
        <p className="mb-1 text-sm font-medium text-olive-800">Options &amp; case sizes</p>
        <p className="mb-3 text-xs text-olive-500">
          Unit size is the weight/volume of one item (e.g. “70 g”). Units per case is how many
          ship in a wholesale case (shown to trade buyers).
        </p>
        <div className="space-y-3">
          {product.variants.map((v) => {
            const parsed = parseUnitSize(v.name);
            return (
              <div key={v.sku} className="rounded-lg border border-olive-100 bg-olive-50/40 p-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Unit size</span>
                    <input
                      name={`sizeAmount__${v.sku}`}
                      defaultValue={parsed.amount}
                      inputMode="decimal"
                      placeholder="e.g. 70"
                      className="h-9 w-full rounded-lg border border-olive-200 px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Unit</span>
                    <select
                      name={`sizeUnit__${v.sku}`}
                      defaultValue={parsed.unit}
                      className="h-9 w-full rounded-lg border border-olive-200 px-2 text-sm"
                    >
                      <option value="">— none —</option>
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Units per case</span>
                    <input
                      name={`case__${v.sku}`}
                      defaultValue={v.unitsPerCase ?? ""}
                      inputMode="numeric"
                      placeholder="e.g. 24"
                      className="h-9 w-full rounded-lg border border-olive-200 px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-olive-600">Price each (USD)</span>
                    <input
                      name={`price__${v.sku}`}
                      defaultValue={v.retailPriceCents != null ? (v.retailPriceCents / 100).toFixed(2) : ""}
                      inputMode="decimal"
                      placeholder="blank = on request"
                      className="h-9 w-full rounded-lg border border-olive-200 px-3 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-olive-400">{v.sku}</p>
              </div>
            );
          })}
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
