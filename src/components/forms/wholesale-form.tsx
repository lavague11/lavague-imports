"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheckBig } from "lucide-react";

import { submitWholesaleApplication } from "@/app/actions/wholesale";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { idleFormState } from "@/lib/form";
import { site } from "@/lib/site";
import {
  BUSINESS_TYPES,
  PRODUCT_INTERESTS,
  VOLUME_BANDS,
} from "@/lib/wholesale-options";

export function WholesaleForm() {
  const [state, formAction] = useActionState(
    submitWholesaleApplication,
    idleFormState,
  );

  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field] : undefined;

  if (state.status === "success") {
    return (
      <div className="rounded-card border border-olive-200 bg-olive-50 p-10 text-center">
        <CircleCheckBig
          className="mx-auto h-10 w-10 text-olive-600"
          aria-hidden="true"
        />
        <h2 className="mt-5 text-2xl text-olive-900">Application received</h2>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-olive-700">
          {state.message}
        </p>
        <p className="mt-5 text-sm text-olive-600">
          Reference{" "}
          <span className="font-semibold text-olive-900">{state.reference}</span>
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-card border border-olive-100 bg-white p-6 shadow-sm sm:p-9"
    >
      <fieldset className="space-y-5">
        <legend className="eyebrow mb-4">Your business</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Business name"
            htmlFor="businessName"
            required
            error={errorFor("businessName")}
          >
            <Input
              id="businessName"
              name="businessName"
              autoComplete="organization"
              required
            />
          </Field>
          <Field
            label="Business type"
            htmlFor="businessType"
            required
            error={errorFor("businessType")}
          >
            <Select id="businessType" name="businessType" defaultValue="GROCERY">
              {BUSINESS_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Contact name"
            htmlFor="contactName"
            required
            error={errorFor("contactName")}
          >
            <Input
              id="contactName"
              name="contactName"
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Website or Instagram" htmlFor="website">
            <Input id="website" name="website" placeholder="@yourshop" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" required error={errorFor("email")}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Phone" htmlFor="phone" required error={errorFor("phone")}>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-10 space-y-5 border-t border-olive-100 pt-8">
        <legend className="eyebrow mb-4">Delivery address</legend>

        <Field
          label="Street address"
          htmlFor="addressLine1"
          required
          error={errorFor("addressLine1")}
        >
          <Input
            id="addressLine1"
            name="addressLine1"
            autoComplete="address-line1"
            required
          />
        </Field>
        <Field label="Suite, unit, floor" htmlFor="addressLine2">
          <Input
            id="addressLine2"
            name="addressLine2"
            autoComplete="address-line2"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="City" htmlFor="city" required error={errorFor("city")}>
            <Input
              id="city"
              name="city"
              autoComplete="address-level2"
              required
            />
          </Field>
          <Field label="State" htmlFor="state" required error={errorFor("state")}>
            <Input
              id="state"
              name="state"
              autoComplete="address-level1"
              defaultValue="NJ"
              required
            />
          </Field>
          <Field
            label="ZIP"
            htmlFor="postalCode"
            required
            error={errorFor("postalCode")}
          >
            <Input
              id="postalCode"
              name="postalCode"
              autoComplete="postal-code"
              required
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-10 space-y-5 border-t border-olive-100 pt-8">
        <legend className="eyebrow mb-4">Trade details</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Federal tax ID (EIN)"
            htmlFor="taxId"
            hint="Needed before your first invoice, but you can send it later."
          >
            <Input id="taxId" name="taxId" />
          </Field>
          <Field label="Resale certificate number" htmlFor="resaleCertNumber">
            <Input id="resaleCertNumber" name="resaleCertNumber" />
          </Field>
        </div>

        <Field label="Estimated monthly purchasing" htmlFor="estimatedMonthlyVolume">
          <Select
            id="estimatedMonthlyVolume"
            name="estimatedMonthlyVolume"
            defaultValue=""
          >
            <option value="">Prefer not to say</option>
            {VOLUME_BANDS.map((band) => (
              <option key={band} value={band}>
                {band}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-2.5 block text-sm font-medium text-olive-800">
            What are you interested in?
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {PRODUCT_INTERESTS.map((interest) => (
              <label
                key={interest}
                className="flex items-center gap-2.5 rounded-lg border border-olive-200 px-3.5 py-2.5 text-sm text-olive-800 hover:border-olive-400"
              >
                <input
                  type="checkbox"
                  name="productInterest"
                  value={interest}
                  className="h-4 w-4 rounded border-olive-300 text-olive-800 accent-olive-800"
                />
                {interest}
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label="Anything else?"
          htmlFor="message"
          hint="Volumes, delivery windows, or products you'd like us to source."
        >
          <Textarea id="message" name="message" rows={4} />
        </Field>
      </fieldset>

      {state.status === "error" ? (
        <p
          role="alert"
          className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-8">
        <SubmitButton />
        <p className="mt-4 text-xs leading-relaxed text-olive-600">
          We review applications within two business days and reply from{" "}
          {site.email}. Nothing is charged and no account is created until
          you&apos;re approved.
        </p>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Submitting…" : "Submit application"}
    </Button>
  );
}
