"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheckBig } from "lucide-react";

import { updateCustomer } from "@/app/admin/actions";
import { AddressFields } from "@/components/admin/address-fields";
import { capitalizeNameOnBlur } from "@/lib/capitalize";
import { idleFormState } from "@/lib/form";

export interface EditableCustomer {
  id: string;
  email: string;
  name: string | null;
  businessName: string | null;
  phone: string | null;
  notes: string | null;
  role: "CUSTOMER" | "WHOLESALE";
  blocked: boolean;
  street: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";
const labelClass = "mb-1 block text-sm font-medium text-olive-800";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 rounded-lg bg-olive-900 px-5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function CustomerEditForm({ customer }: { customer: EditableCustomer }) {
  const [state, action] = useActionState(updateCustomer, idleFormState);

  // Confirm consequential changes (role flip or a block) before submitting.
  const confirmIfNeeded = (e: React.FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget);
    const nextRole = fd.get("role");
    const nextBlocked = fd.get("blocked") === "on";
    const roleChanged = nextRole !== customer.role;
    const blocking = nextBlocked && !customer.blocked;
    if (roleChanged || blocking) {
      const bits = [
        roleChanged ? `change the role to ${nextRole === "WHOLESALE" ? "Wholesale" : "Customer"}` : null,
        blocking ? "block this account" : null,
      ].filter(Boolean);
      if (!window.confirm(`You're about to ${bits.join(" and ")}. Continue?`)) {
        e.preventDefault();
      }
    }
  };

  const fieldError = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} onSubmit={confirmIfNeeded} className="rounded-xl border border-olive-100 bg-white p-5 sm:p-6">
      <input type="hidden" name="id" value={customer.id} />

      {state.status === "success" ? (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CircleCheckBig className="h-4 w-4" aria-hidden="true" /> {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="businessName" className={labelClass}>Business name</label>
          <input id="businessName" name="businessName" defaultValue={customer.businessName ?? ""} onBlur={capitalizeNameOnBlur} className={inputClass} />
        </div>
        <div>
          <label htmlFor="name" className={labelClass}>Contact name</label>
          <input id="name" name="name" defaultValue={customer.name ?? ""} onBlur={capitalizeNameOnBlur} className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" defaultValue={customer.email} className={inputClass} />
          {fieldError?.email ? <p className="mt-1 text-xs font-medium text-red-700">{fieldError.email}</p> : null}
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>Phone</label>
          <input id="phone" name="phone" defaultValue={customer.phone ?? ""} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <AddressFields
            initial={{
              street: customer.street ?? "",
              unit: customer.unit ?? "",
              city: customer.city ?? "",
              state: customer.state ?? "",
              zip: customer.zip ?? "",
              lat: customer.lat != null ? String(customer.lat) : "",
              lng: customer.lng != null ? String(customer.lng) : "",
              placeId: customer.placeId ?? "",
            }}
          />
        </div>
        <div>
          <label htmlFor="role" className={labelClass}>Role</label>
          <select id="role" name="role" defaultValue={customer.role} className={inputClass}>
            <option value="CUSTOMER">Customer (retail)</option>
            <option value="WHOLESALE">Wholesale</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-olive-800">
            <input type="checkbox" name="blocked" defaultChecked={customer.blocked} className="h-4 w-4 accent-red-700" />
            Blocked (can&apos;t sign in or order)
          </label>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className={labelClass}>Internal notes</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={customer.notes ?? ""} className="w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none" />
          <p className="mt-1 text-xs text-olive-500">Only staff see these.</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Save />
      </div>
    </form>
  );
}
