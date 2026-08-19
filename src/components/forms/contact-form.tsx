"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheckBig } from "lucide-react";

import { submitContactMessage } from "@/app/actions/contact";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { idleFormState } from "@/lib/form";

const TOPICS = [
  { value: "GENERAL", label: "General question" },
  { value: "ORDER", label: "An order I've placed" },
  { value: "WHOLESALE", label: "Wholesale / trade" },
  { value: "PRODUCT", label: "A specific product" },
  { value: "DELIVERY", label: "Delivery or pickup" },
];

export function ContactForm() {
  const [state, formAction] = useActionState(
    submitContactMessage,
    idleFormState,
  );

  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field] : undefined;

  if (state.status === "success") {
    return (
      <div className="rounded-card border border-olive-200 bg-olive-50 p-9 text-center">
        <CircleCheckBig
          className="mx-auto h-9 w-9 text-olive-600"
          aria-hidden="true"
        />
        <h2 className="mt-4 text-xl text-olive-900">Message sent</h2>
        <p className="mt-2.5 leading-relaxed text-olive-700">{state.message}</p>
        <p className="mt-4 text-sm text-olive-600">
          Reference{" "}
          <span className="font-semibold text-olive-900">{state.reference}</span>
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-card border border-olive-100 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={errorFor("name")}>
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
          <Field label="Email" htmlFor="email" required error={errorFor("email")}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone" hint="Optional, but faster">
            <Input id="phone" name="phone" type="tel" autoComplete="tel" />
          </Field>
          <Field label="What's it about?" htmlFor="topic">
            <Select id="topic" name="topic" defaultValue="GENERAL">
              {TOPICS.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Message"
          htmlFor="message"
          required
          error={errorFor("message")}
        >
          <Textarea id="message" name="message" rows={6} required />
        </Field>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-7">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Sending…" : "Send message"}
    </Button>
  );
}
