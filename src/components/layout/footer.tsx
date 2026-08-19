import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { navigation, site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-olive-100 bg-olive-50">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-olive-700">
            {site.description}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-olive-900">Explore</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-olive-700">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-olive-900 hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/quote" className="hover:text-olive-900 hover:underline">
                Request a quote
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-olive-900">Get in touch</h2>
          <ul className="mt-4 space-y-3 text-sm text-olive-700">
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-olive-500" aria-hidden="true" />
              <span>
                {site.address.line1}
                <br />
                {site.address.city}, {site.address.state} {site.address.postalCode}
              </span>
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-olive-500" aria-hidden="true" />
              <a href={site.phoneHref} className="hover:text-olive-900 hover:underline">
                {site.phone}
              </a>
            </li>
            <li className="flex gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-olive-500" aria-hidden="true" />
              <a
                href={`mailto:${site.email}`}
                className="break-all hover:text-olive-900 hover:underline"
              >
                {site.email}
              </a>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-olive-100">
        <Container className="flex flex-col gap-2 py-6 text-xs text-olive-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p>Importer &amp; wholesale distributor · New York &amp; New Jersey</p>
        </Container>
      </div>
    </footer>
  );
}
