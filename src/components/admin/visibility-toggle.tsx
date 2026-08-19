"use client";

import { toggleActive } from "@/app/admin/actions";

/**
 * Click-to-toggle visibility for one product, with a confirmation prompt.
 * Posts the desired new state to the toggleActive server action (which
 * revalidates the list — no redirect, so it's safe on this host).
 */
export function VisibilityToggle({ slug, active }: { slug: string; active: boolean }) {
  const confirmMessage = active
    ? "Are you sure you want to hide this product from the store?"
    : "Are you sure you want to make this product visible on the store?";

  return (
    <form
      action={toggleActive}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      {/* the NEW state we want after the click */}
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button
        type="submit"
        title={active ? "Click to hide" : "Click to make visible"}
        className={
          active
            ? "inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100"
            : "inline-flex items-center gap-1.5 rounded-full border border-olive-200 bg-olive-50 px-2.5 py-1 text-xs font-medium text-olive-500 hover:border-olive-400 hover:bg-olive-100"
        }
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-olive-300"}`}
          aria-hidden="true"
        />
        {active ? "Visible" : "Hidden"}
      </button>
    </form>
  );
}
