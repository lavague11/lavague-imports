import Link from "next/link";
import { Leaf, PackageCheck, Ship, Store } from "lucide-react";

import { ProductCard } from "@/components/catalog/product-card";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Flag } from "@/components/ui/flag";
import { getCategories, getCountryFilters, getProducts } from "@/lib/catalog";
import { fullAddress, site } from "@/lib/site";

const guarantees = [
  {
    icon: Ship,
    title: "Imported direct",
    body: "We buy at origin from the producers themselves — no middle layer, no re-labelled stock.",
  },
  {
    icon: PackageCheck,
    title: "Free shipping",
    body: "Every online order ships free, and NY/NJ accounts can arrange same-week delivery.",
  },
  {
    icon: Store,
    title: "Built for wholesale",
    body: "Case pricing, standing reorders, and allocation ahead of Ramadan and Hajj season.",
  },
  {
    icon: Leaf,
    title: "Small, honest range",
    body: "We carry a short list and know every item on it, rather than a catalogue we can't vouch for.",
  },
];

export default async function HomePage() {
  const [featured, categories, countries] = await Promise.all([
    getProducts({ featuredOnly: true }),
    getCategories(),
    Promise.resolve(getCountryFilters()),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-olive-100 bg-gradient-to-b from-olive-50 to-white">
        <Container className="py-20 text-center lg:py-28">
          <p className="eyebrow">{site.tagline}</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl leading-[1.1] text-olive-900 sm:text-5xl lg:text-6xl">
            Bringing international tastes to the States.
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-olive-600">
            Specialty foods, imported direct — from {countries.length} countries to your shelf.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/shop" className={buttonClasses({ size: "lg" })}>
              Shop all
            </Link>
          </div>
        </Container>
      </section>

      {/* Guarantees */}
      <section className="border-b border-olive-100">
        <Container className="grid gap-8 py-14 sm:grid-cols-2 lg:grid-cols-4">
          {guarantees.map((item) => (
            <div key={item.title}>
              <item.icon className="h-6 w-6 text-olive-600" aria-hidden="true" />
              <h2 className="mt-3.5 text-base font-semibold text-olive-900">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-olive-600">
                {item.body}
              </p>
            </div>
          ))}
        </Container>
      </section>

      {/* Best sellers */}
      <section>
        <Container className="py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">What&apos;s moving</p>
              <h2 className="mt-2 text-3xl text-olive-900 sm:text-4xl">
                Best sellers
              </h2>
            </div>
            <Link
              href="/shop"
              className="text-sm font-medium text-olive-700 underline-offset-4 hover:text-olive-900 hover:underline"
            >
              View the full range →
            </Link>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </Container>
      </section>

      {/* Shop by country */}
      <section className="border-t border-olive-100">
        <Container className="py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Foods of the world</p>
              <h2 className="mt-2 text-3xl text-olive-900 sm:text-4xl">
                Shop by country
              </h2>
              <p className="mt-3 max-w-lg text-olive-700">
                Pick a country and see everything we carry from it — {countries.length}{" "}
                origins and counting.
              </p>
            </div>
            <Link
              href="/shop"
              className="text-sm font-medium text-olive-700 underline-offset-4 hover:text-olive-900 hover:underline"
            >
              Browse all products →
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {countries.map((country) => (
              <Link
                key={country.slug}
                href={`/shop?country=${country.slug}`}
                className="group flex flex-col items-center gap-2 rounded-card border border-olive-100 bg-white p-4 text-center transition-colors hover:border-olive-300 hover:bg-olive-50"
              >
                <Flag country={country.name} className="w-11 sm:w-12" />
                <span className="text-sm font-medium text-olive-900">
                  {country.name}
                </span>
                <span className="text-xs text-olive-500">
                  {country.count} {country.count === 1 ? "item" : "items"}
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Categories */}
      <section className="border-y border-olive-100 bg-olive-50">
        <Container className="py-16 lg:py-20">
          <p className="eyebrow">Browse by aisle</p>
          <h2 className="mt-2 text-3xl text-olive-900 sm:text-4xl">
            What we import
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${category.slug}`}
                className="group rounded-card border border-olive-100 bg-white p-7 transition-colors hover:border-olive-300"
              >
                <h3 className="text-xl text-olive-900">{category.name}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-olive-600">
                  {category.description}
                </p>
                <span className="mt-5 inline-block text-sm font-medium text-olive-700 group-hover:underline">
                  Shop {category.name.toLowerCase()} →
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Wholesale CTA */}
      <section className="bg-olive-900 text-white">
        <Container className="grid gap-10 py-16 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-olive-300 uppercase">
              For the trade
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl">
              Stock La Vague in your store
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-olive-100">
              We supply groceries, restaurants, cafés, and distributors across
              New York and New Jersey. Apply for an account and we&apos;ll send
              our current line sheet with case pricing, pack sizes, and delivery
              days for your area.
            </p>
          </div>
          <div className="lg:justify-self-end">
            <div className="rounded-card bg-white/5 p-7 ring-1 ring-white/15">
              <ul className="space-y-3 text-sm text-olive-100">
                <li>· Case pricing and standing reorders</li>
                <li>· Delivery across NY &amp; NJ, pickup in Little Ferry</li>
                <li>· Seasonal allocation for Ramadan and Hajj</li>
                <li>· A real person on the phone: {site.phone}</li>
              </ul>
              <Link
                href="/wholesale"
                className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-olive-900 transition-colors hover:bg-olive-50"
              >
                Apply for wholesale
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Local */}
      <section>
        <Container className="py-16 text-center lg:py-20">
          <h2 className="text-3xl text-olive-900 sm:text-4xl">
            Come by the warehouse
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-olive-700">
            Pickups and trade visits are welcome at {fullAddress}. Call ahead and
            we&apos;ll have your pallet ready on the dock.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={site.phoneHref} className={buttonClasses()}>
              Call {site.phone}
            </a>
            <Link
              href="/contact"
              className={buttonClasses({ variant: "secondary" })}
            >
              Send a message
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
