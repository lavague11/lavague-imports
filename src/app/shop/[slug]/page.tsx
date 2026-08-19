import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Truck } from "lucide-react";

import { AddToQuote } from "@/components/cart/add-to-quote";
import { HalalBadge } from "@/components/catalog/halal-badge";
import { ProductCard } from "@/components/catalog/product-card";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { ProductImage } from "@/components/catalog/product-image";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { getProductBySlug, getProducts, isZabihaMeat, productImages } from "@/lib/catalog";
import { site } from "@/lib/site";

// Pre-render only the featured products; the full 600+ catalog renders on
// demand and is cached thereafter (dynamicParams defaults to true).
export async function generateStaticParams() {
  const featured = await getProducts({ featuredOnly: true });
  return featured.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/shop/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) return { title: "Product not found" };

  return {
    title: product.name,
    description: product.tagline ?? product.description.slice(0, 155),
  };
}

export default async function ProductPage({
  params,
}: PageProps<"/shop/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  const related = (await getProducts({ categorySlug: product.categorySlug }))
    .filter((item) => item.id !== product.id)
    .slice(0, 3);

  const casePack = product.variants.find((variant) => variant.unitsPerCase);
  const gallery = productImages(product);

  return (
    <Container className="py-10 lg:py-14">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-olive-600">
          <li>
            <Link href="/shop" className="hover:text-olive-900 hover:underline">
              Shop
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <li>
            <Link
              href={`/shop?category=${product.categorySlug}`}
              className="hover:text-olive-900 hover:underline"
            >
              {product.categoryName}
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <li aria-current="page" className="text-olive-900">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="relative">
          {gallery.length > 1 ? (
            <ProductGallery images={gallery} alt={product.name} />
          ) : (
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              priority
              className="aspect-square w-full rounded-card border border-olive-100"
            />
          )}
          {product.ribbon ? (
            <Badge ribbon={product.ribbon} className="absolute top-4 left-4" />
          ) : null}
        </div>

        <div>
          <p className="eyebrow">
            {product.brand ?? product.categoryName}
            {product.origin ? ` · ${product.origin}` : ""}
          </p>
          <h1 className="mt-3 text-3xl leading-tight text-olive-900 sm:text-4xl">
            {product.name}
          </h1>
          {isZabihaMeat(product) ? <HalalBadge className="mt-4" /> : null}
          {product.tagline ? (
            <p className="mt-3 text-lg text-olive-600">{product.tagline}</p>
          ) : null}

          <div className="mt-8">
            <AddToQuote
              product={{
                slug: product.slug,
                name: product.name,
                variants: product.variants,
              }}
            />
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-card border border-olive-100 bg-olive-50 p-4 text-sm text-olive-700">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-olive-600" aria-hidden="true" />
            <p>
              Free shipping on every online order. Trade accounts in New York and
              New Jersey can collect from our Little Ferry warehouse or book a
              delivery slot — call {site.phone}.
            </p>
          </div>

          <div className="mt-10 border-t border-olive-100 pt-8">
            <h2 className="text-xl text-olive-900">About this product</h2>
            <p className="mt-3 leading-relaxed text-olive-700">
              {product.description}
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-olive-100 pt-8 text-sm">
            {product.origin ? (
              <div>
                <dt className="text-olive-600">Origin</dt>
                <dd className="mt-1 font-medium text-olive-900">
                  {product.origin}
                </dd>
              </div>
            ) : null}
            {product.brand ? (
              <div>
                <dt className="text-olive-600">Brand</dt>
                <dd className="mt-1 font-medium text-olive-900">{product.brand}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-olive-600">Options</dt>
              <dd className="mt-1 font-medium text-olive-900">
                {product.variants.length === 1
                  ? product.variants[0].name
                  : `${product.variants.length} options`}
              </dd>
            </div>
            {product.variants.length === 1 && casePack?.unitsPerCase ? (
              <div>
                <dt className="text-olive-600">Case size</dt>
                <dd className="mt-1 font-medium text-olive-900">
                  Case of {casePack.unitsPerCase}
                  {casePack.minOrderCases
                    ? ` · ${casePack.minOrderCases} case minimum`
                    : ""}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-8 text-sm text-olive-600">
            Buying for a business?{" "}
            <Link
              href="/wholesale"
              className="font-medium text-olive-800 underline underline-offset-4 hover:text-olive-900"
            >
              Open a wholesale account
            </Link>{" "}
            for case pricing and delivery.
          </p>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-20 border-t border-olive-100 pt-14">
          <h2 className="text-2xl text-olive-900 sm:text-3xl">
            More {product.categoryName.toLowerCase()}
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}
