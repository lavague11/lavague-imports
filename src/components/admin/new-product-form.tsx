"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createProduct } from "@/app/admin/actions";
import { idleFormState } from "@/lib/form";

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

function Create() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-11 rounded-lg bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60">
      {pending ? "Creating…" : "Create product"}
    </button>
  );
}

export function NewProductForm({
  categories,
  countries,
}: {
  categories: { slug: string; name: string }[];
  countries: string[];
}) {
  const [state, action] = useActionState(createProduct, idleFormState);
  return (
    <form action={action} className="space-y-5 rounded-xl border border-olive-100 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-olive-800">Name *</label>
          <input id="name" name="name" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="categorySlug" className="mb-1 block text-sm font-medium text-olive-800">Category *</label>
          <select id="categorySlug" name="categorySlug" required defaultValue="" className={inputClass}>
            <option value="" disabled>Choose…</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sku" className="mb-1 block text-sm font-medium text-olive-800">SKU</label>
          <input id="sku" name="sku" placeholder="auto if blank" className={inputClass} />
        </div>
        <div>
          <label htmlFor="price" className="mb-1 block text-sm font-medium text-olive-800">Price (USD)</label>
          <input id="price" name="price" inputMode="decimal" placeholder="blank = on request" className={inputClass} />
        </div>
        <div>
          <label htmlFor="origin" className="mb-1 block text-sm font-medium text-olive-800">Country of origin</label>
          <select id="origin" name="origin" defaultValue="" className={inputClass}>
            <option value="">Unspecified</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ribbon" className="mb-1 block text-sm font-medium text-olive-800">Ribbon / badge</label>
          <input id="ribbon" name="ribbon" className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="imageUrl" className="mb-1 block text-sm font-medium text-olive-800">Image URL</label>
        <input id="imageUrl" name="imageUrl" placeholder="Paste an image URL…" className={inputClass} />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-olive-800">Description</label>
        <textarea id="description" name="description" rows={3} className={`${inputClass} h-auto py-2`} />
      </div>

      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.message}</p>
      ) : null}
      <Create />
    </form>
  );
}
