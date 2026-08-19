import type { Metadata } from "next";
import Link from "next/link";

import { OliveMark } from "@/components/brand/logo";
import { PrintButton } from "@/components/forms/print-button";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getCategories, getProducts } from "@/lib/catalog";
import { fullAddress, site } from "@/lib/site";
import { formatPriceOrRequest } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Wholesale line sheet",
  description:
    "Current La Vague Imports line sheet: SKUs, sizes, and case packs for wholesale accounts in New York and New Jersey.",
  robots: { index: false },
};

export default async function LineSheetPage() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  return (
    <Container className="py-10 lg:py-14 print:py-0">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          href="/wholesale"
          className="text-sm text-olive-600 hover:text-olive-900 hover:underline"
        >
          ← Back to wholesale
        </Link>
        <div className="flex gap-3">
          <PrintButton />
          <Link href="/wholesale#apply" className={buttonClasses({ size: "sm" })}>
            Apply for an account
          </Link>
        </div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-olive-200 pb-8">
        <div>
          <OliveMark className="h-9 w-auto text-olive-900" />
          <h1 className="mt-4 font-display text-3xl text-olive-900">
            Wholesale line sheet
          </h1>
          <p className="mt-2 text-sm text-olive-600">
            {site.name} · Effective on request · Prices quoted per account
          </p>
        </div>
        <address className="text-sm leading-relaxed text-olive-700 not-italic">
          {fullAddress}
          <br />
          {site.phone}
          <br />
          {site.email}
        </address>
      </header>

      {categories.map((category) => {
        const items = products.filter(
          (product) => product.categorySlug === category.slug,
        );
        if (items.length === 0) return null;

        return (
          <section key={category.id} className="mt-10 break-inside-avoid">
            <h2 className="font-display text-2xl text-olive-900">
              {category.name}
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-olive-200 text-left text-olive-600">
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      Product
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      SKU
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      Size
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      Case pack
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      Min. order
                    </th>
                    <th scope="col" className="py-2.5 text-right font-medium">
                      Retail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.flatMap((product) =>
                    product.variants.map((variant, index) => (
                      <tr
                        key={variant.id}
                        className="border-b border-olive-100 align-top"
                      >
                        <td className="py-3 pr-4 text-olive-900">
                          {index === 0 ? (
                            <>
                              <span className="font-medium">{product.name}</span>
                              {product.origin ? (
                                <span className="block text-xs text-olive-600">
                                  {product.origin}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-olive-500">↳</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-olive-700">
                          {variant.sku}
                        </td>
                        <td className="py-3 pr-4 text-olive-700">
                          {variant.name}
                        </td>
                        <td className="py-3 pr-4 text-olive-700">
                          {variant.unitsPerCase
                            ? `${variant.unitsPerCase} units`
                            : "—"}
                        </td>
                        <td className="py-3 pr-4 text-olive-700">
                          {variant.minOrderCases
                            ? `${variant.minOrderCases} case${variant.minOrderCases === 1 ? "" : "s"}`
                            : "—"}
                        </td>
                        <td className="py-3 text-right text-olive-900">
                          {formatPriceOrRequest(variant.retailPriceCents)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <footer className="mt-12 border-t border-olive-200 pt-6 text-xs leading-relaxed text-olive-600">
        <p>
          Retail prices shown for reference. Wholesale pricing is quoted per
          account against volume and delivery area — call {site.phone} or apply
          online. Stock on seasonal lines (Zamzam, El Mordjene) is allocated;
          reserve ahead of Ramadan and Hajj.
        </p>
      </footer>
    </Container>
  );
}
