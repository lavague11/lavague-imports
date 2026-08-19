"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheckBig, Trash2 } from "lucide-react";

import { submitQuoteRequest } from "@/app/actions/quote";
import { useCart } from "@/components/cart/cart-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { idleFormState } from "@/lib/form";
import { site } from "@/lib/site";
import { formatPrice } from "@/lib/utils";

export function QuoteView() {
  const { lines, isReady, subtotalCents, setQuantity, removeLine, clear } =
    useCart();
  const [state, formAction] = useActionState(submitQuoteRequest, idleFormState);

  // The submitted list is now with sales; drop the local copy so a refresh
  // doesn't resubmit the same products.
  useEffect(() => {
    if (state.status === "success") clear();
  }, [state.status, clear]);

  if (state.status === "success") {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-olive-200 bg-olive-50 p-10 text-center">
        <CircleCheckBig
          className="mx-auto h-10 w-10 text-olive-600"
          aria-hidden="true"
        />
        <h2 className="mt-5 text-2xl text-olive-900">Request received</h2>
        <p className="mt-3 leading-relaxed text-olive-700">{state.message}</p>
        <p className="mt-5 text-sm text-olive-600">
          Your reference is{" "}
          <span className="font-semibold text-olive-900">{state.reference}</span>
          . Quote it if you call us on {site.phone}.
        </p>
        <Link href="/shop" className={buttonClasses({ className: "mt-8" })}>
          Keep browsing
        </Link>
      </div>
    );
  }

  if (!isReady) {
    return (
      <p className="py-16 text-center text-olive-600">Loading your list…</p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-2xl text-olive-900">Your quote list is empty</h2>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-olive-600">
          Add the products you&apos;re interested in and send them over as one
          request. We&apos;ll come back with pricing, freight, and lead time.
        </p>
        <Link href="/shop" className={buttonClasses({ className: "mt-8" })}>
          Browse the range
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      {/* Line items */}
      <section aria-labelledby="items-heading">
        <h2 id="items-heading" className="text-xl text-olive-900">
          Your list
        </h2>

        <ul className="mt-5 divide-y divide-olive-100 border-y border-olive-100">
          {lines.map((line) => (
            <li key={line.variantId} className="flex gap-4 py-5">
              <div className="flex-1">
                <Link
                  href={`/shop/${line.productSlug}`}
                  className="font-medium text-olive-900 hover:underline"
                >
                  {line.productName}
                </Link>
                <p className="mt-1 text-sm text-olive-600">
                  {line.variantName} · {line.sku}
                </p>
                <p className="mt-1 text-sm text-olive-600">
                  {line.unitPriceCents === null
                    ? "Price on request"
                    : `${formatPrice(line.unitPriceCents)} each`}
                </p>
              </div>

              <div className="flex flex-col items-end gap-3">
                <div className="inline-flex items-center rounded-full border border-olive-200">
                  <button
                    type="button"
                    onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                    className="h-9 w-9 rounded-l-full text-olive-700 hover:bg-olive-50"
                  >
                    −<span className="sr-only">Decrease {line.productName}</span>
                  </button>
                  <span className="w-9 text-center text-sm font-medium text-olive-900">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                    className="h-9 w-9 rounded-r-full text-olive-700 hover:bg-olive-50"
                  >
                    +<span className="sr-only">Increase {line.productName}</span>
                  </button>
                </div>
                <span className="text-sm font-semibold text-olive-900">
                  {line.unitPriceCents === null
                    ? "—"
                    : formatPrice(line.unitPriceCents * line.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(line.variantId)}
                  className="inline-flex items-center gap-1.5 text-xs text-olive-600 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                  <span className="sr-only"> {line.productName}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-sm text-olive-600">
            {subtotalCents > 0 ? "Indicative total (priced items)" : "Estimated total"}
          </span>
          <span className="font-display text-2xl text-olive-900">
            {subtotalCents > 0 ? formatPrice(subtotalCents) : "On request"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-olive-600">
          Most of our range is quoted, not listed — send the request and we&apos;ll
          price everything together with case pricing and freight. Any list prices
          shown are indicative and nothing is charged from this page.
        </p>
      </section>

      {/* Contact form */}
      <section aria-labelledby="details-heading">
        <div className="rounded-card border border-olive-100 bg-olive-50 p-6 sm:p-8">
          <h2 id="details-heading" className="text-xl text-olive-900">
            Where should we send the quote?
          </h2>

          <form action={formAction} className="mt-6 space-y-5">
            <input
              type="hidden"
              name="lines"
              value={JSON.stringify(
                lines.map((line) => ({
                  variantId: line.variantId,
                  quantity: line.quantity,
                })),
              )}
            />

            <Field
              label="I'm buying as"
              htmlFor="customerType"
              error={state.status === "error" ? state.fieldErrors?.customerType : undefined}
            >
              <Select id="customerType" name="customerType" defaultValue="RETAIL">
                <option value="RETAIL">An individual</option>
                <option value="WHOLESALE">A business / trade account</option>
              </Select>
            </Field>

            <Field
              label="Full name"
              htmlFor="name"
              required
              error={state.status === "error" ? state.fieldErrors?.name : undefined}
            >
              <Input id="name" name="name" autoComplete="name" required />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Email"
                htmlFor="email"
                required
                error={state.status === "error" ? state.fieldErrors?.email : undefined}
              >
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </Field>
              <Field
                label="Phone"
                htmlFor="phone"
                required
                error={state.status === "error" ? state.fieldErrors?.phone : undefined}
              >
                <Input id="phone" name="phone" type="tel" autoComplete="tel" required />
              </Field>
            </div>

            <Field label="Business name" htmlFor="company" hint="Leave blank if this is a personal order">
              <Input id="company" name="company" autoComplete="organization" />
            </Field>

            <fieldset className="grid gap-5 sm:grid-cols-3">
              <legend className="eyebrow mb-2">Delivery area</legend>
              <Field label="City" htmlFor="deliveryCity">
                <Input id="deliveryCity" name="deliveryCity" autoComplete="address-level2" />
              </Field>
              <Field label="State" htmlFor="deliveryState">
                <Input id="deliveryState" name="deliveryState" autoComplete="address-level1" />
              </Field>
              <Field label="ZIP" htmlFor="deliveryPostalCode">
                <Input id="deliveryPostalCode" name="deliveryPostalCode" autoComplete="postal-code" />
              </Field>
            </fieldset>

            <Field
              label="Anything else we should know?"
              htmlFor="message"
              hint="Delivery deadlines, case quantities, or products you'd like us to source."
            >
              <Textarea id="message" name="message" rows={4} />
            </Field>

            {state.status === "error" ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {state.message}
              </p>
            ) : null}

            <SubmitButton />

            <p className="text-xs leading-relaxed text-olive-600">
              No payment is taken here. We&apos;ll reply from {site.email}, usually
              within one business day.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Sending…" : "Send quote request"}
    </Button>
  );
}
