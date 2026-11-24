import type { Metadata } from "next";
import Link from "next/link";
import { Download, Lock } from "lucide-react";

import { CatalogBuilder } from "@/components/catalog/catalog-builder";
import { Container } from "@/components/ui/container";
import { getCategories, getCountryFilters } from "@/lib/catalog";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Download our catalog",
  description: "Download a PDF catalog of La Vague Imports — by country, by category, or the whole range. For approved wholesale accounts.",
};

// Auth-gated (reads the customer session), so never statically cached.
export const dynamic = "force-dynamic";

/** Gate shown to anyone who isn't an approved wholesale account. */
async function CatalogGate({ loggedIn, customerId }: { loggedIn: boolean; customerId?: string }) {
  // For a signed-in retail customer, surface their application status so the
  // message is honest ("under review" vs "apply").
  let pending = false;
  if (loggedIn && customerId) {
    const prisma = getPrisma();
    const app = await prisma?.wholesaleApplication
      .findFirst({ where: { customerId }, orderBy: { createdAt: "desc" }, select: { status: true } })
      .catch(() => null);
    pending = app?.status === "NEW" || app?.status === "IN_REVIEW";
  }

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">Catalog</p>
        <h1 className="mt-3 text-4xl text-olive-900 sm:text-5xl">Our catalog</h1>
        <p className="mt-4 text-olive-700">
          Our full PDF catalog — with case packs and trade pricing — is available to approved
          wholesale accounts.
        </p>
      </header>

      <div className="mt-8 max-w-xl rounded-2xl border border-olive-200 bg-olive-50 p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-olive-900 text-white">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="text-xl text-olive-900">
            {pending ? "Your application is under review" : "For approved wholesale accounts"}
          </h2>
        </div>

        {pending ? (
          <p className="mt-4 text-sm leading-relaxed text-olive-700">
            Thanks — we&apos;ve got your wholesale application and we&apos;re reviewing it (usually
            within two business days). As soon as it&apos;s approved, your catalog download will
            appear here automatically.
          </p>
        ) : loggedIn ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-olive-700">
              You&apos;re signed in, but this account isn&apos;t approved for wholesale yet. Apply
              for an account — it takes about two minutes — and we&apos;ll open up the catalog and
              case pricing for you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/wholesale#apply"
                className="inline-flex h-11 items-center justify-center rounded-full bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800"
              >
                Apply for a wholesale account
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-olive-700">
              Already have a wholesale account? Sign in to download your catalog. New to La Vague?
              Apply for an account and we&apos;ll get you set up.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login?next=/catalog"
                className="inline-flex h-11 items-center justify-center rounded-full bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800"
              >
                Sign in
              </Link>
              <Link
                href="/wholesale#apply"
                className="inline-flex h-11 items-center justify-center rounded-full border border-olive-300 bg-white px-6 text-sm font-medium text-olive-900 hover:border-olive-500 hover:bg-olive-50"
              >
                Apply for an account
              </Link>
            </div>
          </>
        )}
      </div>

      <p className="mt-8 text-sm text-olive-500">
        Prefer to browse without an account?{" "}
        <Link href="/shop" className="font-medium text-olive-800 underline underline-offset-4">
          Visit the shop
        </Link>
        .
      </p>
    </Container>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customer = await getCustomer();

  // Approved wholesale accounts only.
  if (customer?.role !== "WHOLESALE") {
    return <CatalogGate loggedIn={!!customer} customerId={customer?.id} />;
  }

  const [categories, countries] = await Promise.all([getCategories(), getCountryFilters()]);
  const empty = (await searchParams).empty === "1";

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">Catalog</p>
        <h1 className="mt-3 text-4xl text-olive-900 sm:text-5xl">Download our catalog</h1>
        <p className="mt-4 text-olive-700">Select the countries and categories you want — or download the whole range.</p>
      </header>

      {/* Whole-catalog quick download */}
      <Link
        href="/catalog/generate"
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-full border border-olive-300 bg-white px-6 text-sm font-medium text-olive-900 hover:border-olive-500 hover:bg-olive-50"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download the full catalog (PDF)
      </Link>

      {empty ? (
        <p className="mt-6 max-w-2xl rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nothing matched that selection. Try fewer filters, or download the full catalog above.
        </p>
      ) : null}

      <div className="mt-12 border-t border-olive-100 pt-10">
        <p className="eyebrow mb-6">Or build your own</p>
        <CatalogBuilder
          countries={countries.map((c) => ({ slug: c.slug, name: c.name, count: c.count }))}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        />
      </div>
    </Container>
  );
}
