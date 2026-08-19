"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changePassword } from "@/app/admin/actions";
import { idleFormState } from "@/lib/form";

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 rounded-lg bg-olive-900 px-5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60"
    >
      {pending ? "Updating…" : "Change password"}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, idleFormState);
  return (
    <form action={action} className="max-w-sm rounded-xl border border-olive-100 bg-white p-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="current" className="mb-1 block text-sm font-medium text-olive-800">
            Current password
          </label>
          <input id="current" name="current" type="password" autoComplete="current-password" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="next" className="mb-1 block text-sm font-medium text-olive-800">
            New password (8+ characters)
          </label>
          <input id="next" name="next" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-olive-800">
            Confirm new password
          </label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
        </div>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Password changed.
        </p>
      ) : null}
      <div className="mt-5">
        <Save />
      </div>
    </form>
  );
}
