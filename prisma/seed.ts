import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { categories, products } from "../src/lib/catalog/data";

/**
 * Loads the generated catalog (src/lib/catalog/catalog.json, produced by
 * scripts/import-wix-catalog.mjs) into Postgres.
 *
 * Strategy: reset the catalog tables, then bulk-insert. This is idempotent and
 * far faster than per-row upserts for a 600+ product catalog. Quote/wholesale
 * submissions are left untouched (QuoteItem.variantId is set null on delete).
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — nothing to seed.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  // Reset catalog tables (variants cascade from products; categories last).
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});

  await prisma.category.createMany({
    data: categories.map((category, index) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      position: index,
    })),
  });

  await prisma.product.createMany({
    data: products.map((product, index) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      description: product.description,
      origin: product.origin,
      brand: product.brand,
      imageUrl: product.imageUrl,
      ribbon: product.ribbon,
      collections: product.collections,
      isFeatured: product.isFeatured,
      position: index,
      categoryId: `cat_${product.categorySlug}`,
    })),
  });

  await prisma.productVariant.createMany({
    data: products.flatMap((product) =>
      product.variants.map((variant, variantIndex) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        retailPriceCents: variant.retailPriceCents,
        compareAtPriceCents: variant.compareAtPriceCents,
        unitsPerCase: variant.unitsPerCase,
        minOrderCases: variant.minOrderCases,
        inStock: variant.inStock,
        position: variantIndex,
        productId: product.id,
      })),
    ),
  });

  // The warehouse the storefront ships from today. Delivery zones are modelled
  // now so the future multi-store rollout has somewhere to hang.
  await prisma.store.upsert({
    where: { slug: "little-ferry" },
    update: {},
    create: {
      slug: "little-ferry",
      name: "La Vague Imports — Little Ferry",
      addressLine1: "120 Industrial Ave",
      city: "Little Ferry",
      state: "NJ",
      postalCode: "07643",
      phone: "646-396-0775",
      email: "Sales@lavagueimports.com",
    },
  });

  const counts = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
  };
  console.log("Seed complete:", counts);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
