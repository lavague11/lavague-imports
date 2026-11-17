"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveCustomerNotes } from "@/app/admin/actions";
import { idleFormState } from "@/lib/form";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-lg bg-olive-900 px-4 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save notes"}
    </button>
  );
}

export function InlineNotes({ id, notes }: { id: string; notes: string | null }) {
  const [state, action] = useActionState(saveCustomerNotes, idleFormState);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <textarea
        name="notes"
        rows={3}
        defaultValue={notes ?? ""}
        placeholder="Add a note — only staff see this."
        className="w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <SaveButton />
        {state.status === "success" ? <span className="text-xs text-emerald-700">{state.message}</span> : null}
        {state.status === "error" ? <span className="text-xs text-red-700">{state.message}</span> : null}
      </div>
    </form>
  );
}
