import { ImageSlots } from "@/components/admin/image-slots";

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

const ERRORS: Record<string, string> = {
  required: "Name and category are required.",
  create: "Couldn't create the product (duplicate slug, or DB offline?).",
};

/**
 * Plain form POST to the /admin/products/create route (Post/Redirect/Get) — a
 * full-page navigation, not a Server Action, so the redirect can't trip the
 * client error boundary on this host. multipart encoding carries file uploads.
 */
export function NewProductForm({
  categories,
  countries,
  errorCode,
}: {
  categories: { slug: string; name: string }[];
  countries: string[];
  errorCode?: string | null;
}) {
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? "Something went wrong.") : null;

  return (
    <form
      action="/admin/products/create"
      method="post"
      encType="multipart/form-data"
      className="space-y-5 rounded-xl border border-olive-100 bg-white p-6"
    >
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
          <label htmlFor="origin" className="mb-1 block text-sm font-medium text-olive-800">Country of origin</label>
          <input id="origin" name="origin" list="country-options" placeholder="Type or choose…" className={inputClass} />
          <datalist id="country-options">
            {countries.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      {/* Unit size / case / price */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="unitSize" className="mb-1 block text-sm font-medium text-olive-800">Unit size / weight</label>
          <input id="unitSize" name="unitSize" placeholder="e.g. 70 g" className={inputClass} />
        </div>
        <div>
          <label htmlFor="unitsPerCase" className="mb-1 block text-sm font-medium text-olive-800">Units per case</label>
          <input id="unitsPerCase" name="unitsPerCase" inputMode="numeric" placeholder="e.g. 24" className={inputClass} />
        </div>
        <div>
          <label htmlFor="price" className="mb-1 block text-sm font-medium text-olive-800">Price each (USD)</label>
          <input id="price" name="price" inputMode="decimal" placeholder="blank = on request" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="ribbon" className="mb-1 block text-sm font-medium text-olive-800">Ribbon / badge</label>
        <input id="ribbon" name="ribbon" placeholder="e.g. Best Seller" className={inputClass} />
      </div>

      <ImageSlots />

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-olive-800">Description</label>
        <textarea id="description" name="description" rows={3} className={`${inputClass} h-auto py-2`} />
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</p>
      ) : null}

      <button
        type="submit"
        className="h-11 rounded-lg bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800"
      >
        Create product
      </button>
    </form>
  );
}
