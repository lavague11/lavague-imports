import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { fullAddress, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: `${site.name} is a specialty food importer in ${site.address.city}, ${site.address.state}, supplying retailers and restaurants across New York and New Jersey.`,
};

const origins = [
  {
    country: "Morocco",
    what: "Olive oil from the Ouazzane groves — virgin, extra virgin, and the house cooking tin.",
  },
  {
    country: "Egypt",
    what: "The Schweppes collection, including the pomegranate bottling with the pulp left in.",
  },
  {
    country: "Saudi Arabia",
    what: "Authentic Zamzam water in the official 5 litre container, with documented provenance.",
  },
  {
    country: "Algeria",
    what: "El Mordjene roasted hazelnut cream, in the short runs the exporter releases.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-olive-100 bg-gradient-to-b from-olive-50 to-white">
        <Container className="max-w-3xl py-16 lg:py-20">
          <p className="eyebrow">About us</p>
          <h1 className="mt-3 text-4xl leading-tight text-olive-900 sm:text-5xl">
            A short list, sourced properly
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-olive-700">
            La Vague Imports is a specialty food importer based in{" "}
            {site.address.city}, New Jersey. We bring in Mediterranean and North
            African staples — olive oil, beverages, and the odd cult item — and
            supply them to groceries, restaurants, and households across New York
            and New Jersey.
          </p>
        </Container>
      </section>

      <section>
        <Container className="grid max-w-5xl gap-12 py-16 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="text-2xl text-olive-900 sm:text-3xl">
              Why the range is small
            </h2>
            <p className="mt-4 leading-relaxed text-olive-700">
              Most importers compete on breadth. We&apos;d rather be able to tell
              you which harvest a tin came from, and whether the next container
              is on the water. That means a deliberately short list, bought
              direct from the producer instead of through a re-labelling
              middleman.
            </p>
            <p className="mt-4 leading-relaxed text-olive-700">
              It also means being straight about supply. Some of what we carry —
              Zamzam water, El Mordjene — is genuinely constrained at origin. When
              stock is tight we say so, and we allocate it to the accounts that
              committed early rather than pretending it&apos;s endless.
            </p>
          </div>

          <div>
            <h2 className="text-2xl text-olive-900 sm:text-3xl">
              Where it comes from
            </h2>
            <dl className="mt-4 divide-y divide-olive-100 border-y border-olive-100">
              {origins.map((origin) => (
                <div key={origin.country} className="py-4">
                  <dt className="font-medium text-olive-900">{origin.country}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-olive-600">
                    {origin.what}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      <section className="border-t border-olive-100 bg-olive-50">
        <Container className="py-16 text-center lg:py-20">
          <h2 className="text-3xl text-olive-900 sm:text-4xl">
            Serving New York &amp; New Jersey
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-olive-700">
            Everything ships from our warehouse at {fullAddress}. Retail orders
            go out with free shipping; trade accounts get delivery routes across
            the metro area and pickup on the dock.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/shop" className={buttonClasses()}>
              Shop the range
            </Link>
            <Link
              href="/wholesale"
              className={buttonClasses({ variant: "secondary" })}
            >
              Wholesale accounts
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
