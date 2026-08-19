"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createUser } from "@/app/admin/actions";
import { idleFormState } from "@/lib/form";

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none";

function Add() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-10 rounded-lg bg-olive-900 px-5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60">
      {pending ? "Adding…" : "Add user"}
    </button>
  );
}

export function NewUserForm() {
  const [state, action] = useActionState(createUser, idleFormState);
  return (
    <form action={action} className="rounded-xl border border-olive-100 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-olive-800">Email *</label>
          <input id="email" name="email" type="email" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-olive-800">Name</label>
          <input id="name" name="name" className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-olive-800">Password * (8+ chars)</label>
          <input id="password" name="password" type="password" required minLength={8} className={inputClass} />
        </div>
        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-medium text-olive-800">Role</label>
          <select id="role" name="role" defaultValue="EDITOR" className={inputClass}>
            <option value="EDITOR">Editor (products only)</option>
            <option value="ADMIN">Admin (products + users)</option>
          </select>
        </div>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.message}</p>
      ) : null}
      {state.status === "success" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
      ) : null}
      <div className="mt-4">
        <Add />
      </div>
    </form>
  );
}
