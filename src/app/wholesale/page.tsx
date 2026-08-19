import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Handshake, PhoneCall, Truck } from "lucide-react";

import { WholesaleForm } from "@/components/forms/wholesale-form";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { fullAddress, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wholesale",
  description:
    "Open a wholesale account with La Vague Imports for case pricing on Moroccan olive oil, Egyptian beverages, and North African specialties across NY and NJ.",
};

const steps = [
  {
    icon: FileText,
    title: "1. Apply",
    body: "Tell us about your business and where you'd like deliveries. Two minutes, no commitment.",
  },
  {
    icon: PhoneCall,
    title: "2. We call you",
    body: "We review within two business days and send the current line sheet with case pricing for your volume.",
  },
  {
    icon: Truck,
    title: "3. Order and receive",
    body: "Place orders by phone, email, or your quote list. Delivery across NY and NJ, or collect in Little Ferry.",
  },
];

const terms = [
  {
    label: "Minimum first order",
    value: "$500",
    note: "Mixed cases across the range are fine.",
  },
  {
    label: "Delivery",
    value: "NY & NJ",
    note: "Free over $1,000; otherwise quoted by ZIP.",
  },
  {
    label: "Lead time",
    value: "2–5 days",
    note: "Same-week for stocked lines in Little Ferry.",
  },
  {
    label: "Payment terms",
    value: "Net 15",
    note: "Available after your first three orders.",
  },
];

export default function WholesalePage() {
  return (
    <>
      <section className="border-b border-olive-100 bg-gradient-to-b from-olive-50 to-white">
        <Container className="grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <p className="eyebrow">For the trade</p>
            <h1 className="mt-3 text-4xl leading-tight text-olive-900 sm:text-5xl">
              Wholesale accounts
            </h1>
            <p className="mt-5 max-w-lg leading-relaxed text-olive-700">
              We supply groceries, restaurants, cafés, and distributors across
              New York and New Jersey with imports you can&apos;t get from a
              national broadliner. Direct sourcing, short supply chain, and a
              phone number that a person answers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#apply" className={buttonClasses({ size: "lg" })}>
                Apply for an account
              </Link>
              <Link
                href="/wholesale/line-sheet"
                className={buttonClasses({ variant: "secondary", size: "lg" })}
              >
                View the line sheet
              </Link>
            </div>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            {terms.map((term) => (
              <div
                key={term.label}
                className="rounded-card border border-olive-100 bg-white p-5"
              >
                <dt className="text-xs tracking-wide text-olive-600 uppercase">
                  {term.label}
                </dt>
                <dd className="mt-2 font-display text-2xl text-olive-900">
                  {term.value}
                </dd>
                <p className="mt-1.5 text-xs leading-relaxed text-olive-600">
                  {term.note}
                </p>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section>
        <Container className="py-16 lg:py-20">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 text-3xl text-olive-900 sm:text-4xl">
            From application to first delivery
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.title}
                className="rounded-card border border-olive-100 p-7"
              >
                <step.icon className="h-6 w-6 text-olive-600" aria-hidden="true" />
                <h3 className="mt-4 text-lg text-olive-900">{step.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-olive-600">
                  {step.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-4 rounded-card bg-olive-900 p-7 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-olive-300" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-olive-100">
                Prefer to talk it through first? Call {site.phone} — we&apos;ll
                tell you honestly whether we&apos;re the right supplier for your
                volume before you fill anything in.
              </p>
            </div>
            <a
              href={site.phoneHref}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-olive-900 hover:bg-olive-50"
            >
              Call us
            </a>
          </div>
        </Container>
      </section>

      <section id="apply" className="scroll-mt-24 border-t border-olive-100 bg-olive-50">
        <Container className="py-16 lg:py-20">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="eyebrow">Apply</p>
              <h2 className="mt-2 text-3xl text-olive-900 sm:text-4xl">
                Open a wholesale account
              </h2>
              <p className="mx-auto mt-4 max-w-xl leading-relaxed text-olive-700">
                Approved accounts get case pricing, allocation ahead of seasonal
                demand, and a standing delivery slot. Deliveries run from{" "}
                {fullAddress}.
              </p>
            </div>

            <div className="mt-10">
              <WholesaleForm />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
