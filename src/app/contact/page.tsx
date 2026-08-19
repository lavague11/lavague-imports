import type { Metadata } from "next";
import Link from "next/link";
import { AtSign, Clock, Mail, MapPin, Phone } from "lucide-react";

import { ContactForm } from "@/components/forms/contact-form";
import { Container } from "@/components/ui/container";
import { fullAddress, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Reach La Vague Imports in ${site.address.city}, ${site.address.state} — ${site.phone} or ${site.email}.`,
};

export default function ContactPage() {
  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">Contact</p>
        <h1 className="mt-3 text-4xl text-olive-900 sm:text-5xl">
          Talk to a person
        </h1>
        <p className="mt-4 leading-relaxed text-olive-700">
          Orders, sourcing requests, delivery windows, or a product you
          can&apos;t find anywhere else — call, write, or come by the warehouse.
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <div className="space-y-8">
          <ContactRow icon={Phone} label="Phone or text">
            <a
              href={site.phoneHref}
              className="text-lg font-medium text-olive-900 hover:underline"
            >
              {site.phone}
            </a>
            <p className="mt-1 text-sm text-olive-600">
              Fastest for stock checks and delivery questions.
            </p>
          </ContactRow>

          <ContactRow icon={Mail} label="Email">
            <a
              href={`mailto:${site.email}`}
              className="break-all text-lg font-medium text-olive-900 hover:underline"
            >
              {site.email}
            </a>
            <p className="mt-1 text-sm text-olive-600">
              Send purchase orders and resale certificates here.
            </p>
          </ContactRow>

          <ContactRow icon={MapPin} label="Warehouse & pickup">
            <p className="text-lg font-medium text-olive-900">{fullAddress}</p>
            <p className="mt-1 text-sm text-olive-600">
              Trade pickups welcome — please call ahead so we can have your
              pallet on the dock.
            </p>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-olive-700 underline underline-offset-4 hover:text-olive-900"
            >
              Open in Maps
            </a>
          </ContactRow>

          <ContactRow icon={Clock} label="Hours">
            <p className="text-olive-900">Monday – Friday · 9am – 5pm ET</p>
            <p className="mt-1 text-sm text-olive-600">
              Weekend deliveries can be arranged for trade accounts.
            </p>
          </ContactRow>

          <ContactRow icon={AtSign} label="Follow along">
            <a
              href={site.social.instagram}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-olive-900 hover:underline"
            >
              @lavagueimports
            </a>
            <p className="mt-1 text-sm text-olive-600">
              New arrivals and restocks are posted here first.
            </p>
          </ContactRow>

          <div className="rounded-card border border-olive-100 bg-olive-50 p-6">
            <h2 className="text-base font-semibold text-olive-900">
              Looking to stock our products?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-olive-700">
              Trade enquiries are handled through the wholesale application, so
              we can send you the right pricing straight away.
            </p>
            <Link
              href="/wholesale"
              className="mt-4 inline-block text-sm font-medium text-olive-800 underline underline-offset-4 hover:text-olive-900"
            >
              Apply for a wholesale account →
            </Link>
          </div>
        </div>

        <div>
          <ContactForm />
        </div>
      </div>
    </Container>
  );
}

function ContactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-olive-500" aria-hidden />
      <div>
        <p className="eyebrow">{label}</p>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}
