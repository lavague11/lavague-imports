"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login } from "@/app/admin/actions";
import { idleFormState } from "@/lib/form";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, idleFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/admin"} />
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-olive-800">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-olive-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
        />
      </div>
      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
