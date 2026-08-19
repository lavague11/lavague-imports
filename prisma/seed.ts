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

  // Reset only the imported catalog — admin-created products (isCustom) and
  // their variants are spared. Categories are upserted (not deleted) so custom
  // products keep a valid categoryId.
  await prisma.category.createMany({
    data: categories.map((category, index) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      position: index,
    })),
    skipDuplicates: true,
  });
  for (const [index, category] of categories.entries()) {
    await prisma.category.update({
      where: { slug: category.slug },
      data: { name: category.name, description: category.description, position: index },
    });
  }

  await prisma.product.deleteMany({ where: { isCustom: false } });

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
      source: product.source,
      minPriceCents: product.minPriceCents,
      ribbon: product.ribbon,
      collections: product.collections,
      isFeatured: product.isFeatured,
      isCustom: false,
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

  // Re-apply durable admin edits on top of the freshly imported source rows,
  // so nothing done in the portal is lost by a re-import.
  const overrides = await prisma.productOverride.findMany();
  for (const o of overrides) {
    const product = await prisma.product.findUnique({ where: { slug: o.slug } });
    if (!product) continue;
    const data: Record<string, unknown> = {};
    if (o.name != null) data.name = o.name;
    if (o.tagline != null) data.tagline = o.tagline;
    if (o.description != null) data.description = o.description;
    const images = (o.images ?? null) as string[] | null;
    if (images && images.length) {
      data.images = images;
      data.imageUrl = images[0];
    } else if (o.imageUrl != null) {
      data.imageUrl = o.imageUrl;
    }
    if (o.origin != null) data.origin = o.origin;
    if (o.ribbon != null) data.ribbon = o.ribbon;
    if (o.isFeatured != null) data.isFeatured = o.isFeatured;
    if (o.isActive != null) data.isActive = o.isActive;
    if (o.categorySlug != null) data.categoryId = `cat_${o.categorySlug}`;
    if (Object.keys(data).length) {
      await prisma.product.update({ where: { id: product.id }, data });
    }
    const prices = (o.variantPrices ?? {}) as Record<string, number>;
    for (const [sku, cents] of Object.entries(prices)) {
      await prisma.productVariant.updateMany({
        where: { sku },
        data: { retailPriceCents: cents },
      });
    }
    const packs = (o.variantPacks ?? {}) as Record<string, { size?: string | null; unitsPerCase?: number | null }>;
    for (const [sku, pack] of Object.entries(packs)) {
      const packData: Record<string, unknown> = {};
      if (pack.size != null && pack.size !== "") packData.name = pack.size;
      if (pack.unitsPerCase != null) packData.unitsPerCase = pack.unitsPerCase;
      if (Object.keys(packData).length) {
        await prisma.productVariant.updateMany({ where: { sku }, data: packData });
      }
    }
  }
  if (overrides.length) console.log(`Re-applied ${overrides.length} product overrides.`);

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
