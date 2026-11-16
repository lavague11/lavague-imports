"use client";

import { useRef } from "react";

import { toggleActive } from "@/app/admin/actions";

/**
 * Inline status dropdown for one product row. Changing it submits straight to
 * the toggleActive server action (which revalidates the list — no redirect, so
 * it's safe on the live host). `active` is the current server state.
 */
export function StatusSelect({ slug, active }: { slug: string; active: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={toggleActive}>
      <input type="hidden" name="slug" value={slug} />
      <select
        name="active"
        defaultValue={active ? "true" : "false"}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Product status"
        className={
          "h-8 rounded-full border bg-white px-2.5 text-xs font-medium focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none " +
          (active
            ? "border-emerald-200 text-emerald-700"
            : "border-olive-200 text-olive-500")
        }
      >
        <option value="true">Visible</option>
        <option value="false">Hidden</option>
      </select>
    </form>
  );
}
