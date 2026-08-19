import "server-only";

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { requirePrisma } from "@/lib/db";

export interface ProductEdits {
  name?: string;
  tagline?: string | null;
  description?: string;
  imageUrl?: string | null;
  origin?: string | null;
  ribbon?: string | null;
  categorySlug?: string;
  isFeatured?: boolean;
  isActive?: boolean;
  /** Per-variant price in cents, keyed by SKU. null clears the price. */
  variantPrices?: Record<string, number | null>;
}

const IMG_DIR = path.join(process.cwd(), "public", "products", "custom");

/**
 * Downloads a remote image into public/products/custom so the storefront serves
 * it locally (no per-host next.config wiring, no hotlinking). Returns the local
 * path, or the original URL if the download fails. Note: writes to the local
 * filesystem — for a serverless host, swap this for object storage.
 */
export async function localizeImage(slug: string, url: string): Promise<string> {
  if (!url || url.startsWith("/products/")) return url;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return url;
    const type = res.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(IMG_DIR, { recursive: true });
    const file = `${slug}.${ext}`;
    await writeFile(path.join(IMG_DIR, file), buf);
    return `/products/custom/${file}`;
  } catch {
    return url;
  }
}

/** Upsert the durable override and apply the edits to the live product rows. */
export async function saveProductEdits(
  slug: string,
  edits: ProductEdits,
  updatedById?: string,
): Promise<void> {
  const prisma = requirePrisma();

  // Durable override record (only the provided fields).
  const overrideData = {
    name: edits.name,
    tagline: edits.tagline,
    description: edits.description,
    imageUrl: edits.imageUrl,
    origin: edits.origin,
    ribbon: edits.ribbon,
    categorySlug: edits.categorySlug,
    isFeatured: edits.isFeatured,
    isActive: edits.isActive,
    variantPrices: edits.variantPrices ?? undefined,
    updatedById,
  };
  await prisma.productOverride.upsert({
    where: { slug },
    update: overrideData,
    create: { slug, ...overrideData },
  });

  // Apply to the live product.
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) return;

  const data: Record<string, unknown> = {};
  if (edits.name !== undefined) data.name = edits.name;
  if (edits.tagline !== undefined) data.tagline = edits.tagline;
  if (edits.description !== undefined) data.description = edits.description;
  if (edits.imageUrl !== undefined) data.imageUrl = edits.imageUrl;
  if (edits.origin !== undefined) data.origin = edits.origin;
  if (edits.ribbon !== undefined) data.ribbon = edits.ribbon;
  if (edits.isFeatured !== undefined) data.isFeatured = edits.isFeatured;
  if (edits.isActive !== undefined) data.isActive = edits.isActive;
  if (edits.categorySlug !== undefined) data.categoryId = `cat_${edits.categorySlug}`;
  if (Object.keys(data).length) {
    await prisma.product.update({ where: { id: product.id }, data });
  }

  for (const [sku, cents] of Object.entries(edits.variantPrices ?? {})) {
    await prisma.productVariant.updateMany({ where: { sku }, data: { retailPriceCents: cents } });
  }
}

export async function setActive(slugs: string[], isActive: boolean, updatedById?: string): Promise<void> {
  const prisma = requirePrisma();
  await prisma.product.updateMany({ where: { slug: { in: slugs } }, data: { isActive } });
  for (const slug of slugs) {
    await prisma.productOverride.upsert({
      where: { slug },
      update: { isActive, updatedById },
      create: { slug, isActive, updatedById },
    });
  }
}

export interface NewProductInput {
  name: string;
  slug: string;
  sku: string;
  categorySlug: string;
  description: string;
  origin?: string | null;
  ribbon?: string | null;
  imageUrl?: string | null;
  priceCents?: number | null;
}

/** Creates an admin-owned (isCustom) product with a single variant. */
export async function createCustomProduct(input: NewProductInput): Promise<void> {
  const prisma = requirePrisma();
  const id = `custom_${input.slug}`;
  await prisma.product.create({
    data: {
      id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      origin: input.origin ?? null,
      ribbon: input.ribbon ?? null,
      imageUrl: input.imageUrl ?? null,
      collections: [],
      isCustom: true,
      isActive: true,
      categoryId: `cat_${input.categorySlug}`,
      variants: {
        create: {
          sku: input.sku,
          name: "Each",
          retailPriceCents: input.priceCents ?? null,
          inStock: true,
          position: 0,
        },
      },
    },
  });
}
