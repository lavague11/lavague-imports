import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { requirePrisma } from "@/lib/db";

/** A single-variant pack edit. */
export interface VariantPack {
  /** Size/weight label, e.g. "70 g" — also the variant's option name. */
  size?: string | null;
  /** How many units ship in a wholesale case. */
  unitsPerCase?: number | null;
}

export interface ProductEdits {
  name?: string;
  tagline?: string | null;
  description?: string;
  imageUrl?: string | null;
  /** Full replacement gallery (up to 3). imageUrl is kept in sync with [0]. */
  images?: string[];
  origin?: string | null;
  ribbon?: string | null;
  categorySlug?: string;
  isFeatured?: boolean;
  isActive?: boolean;
  isFragile?: boolean;
  /** Per-variant price in cents, keyed by SKU. null clears the price. */
  variantPrices?: Record<string, number | null>;
  /** Per-variant pack (size + units per case), keyed by SKU. */
  variantPacks?: Record<string, VariantPack>;
}

/** True for paths we serve ourselves (DB media or bundled files) — never
 *  re-download these. */
function isLocalPath(url: string): boolean {
  return url.startsWith("/media/") || url.startsWith("/products/");
}

/** Stores raw image bytes in the database and returns its /media/<id> URL. */
async function storeMedia(contentType: string, data: Buffer): Promise<string> {
  const prisma = requirePrisma();
  const asset = await prisma.mediaAsset.create({
    data: { contentType: contentType || "image/jpeg", data: Uint8Array.from(data) },
    select: { id: true },
  });
  return `/media/${asset.id}`;
}

/**
 * Downloads a remote image and stores it in the database (MediaAsset), returning
 * a durable /media/<id> URL that survives redeploys. Local paths pass through;
 * on any download failure the original URL is returned unchanged.
 */
export async function localizeImage(url: string): Promise<string> {
  if (!url || isLocalPath(url)) return url;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return url;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return url;
    return await storeMedia(contentType, buf);
  } catch {
    return url;
  }
}

/**
 * Collects up to `count` image slots from a submitted form. Each slot i may
 * carry an uploaded file (imageFile<i>, which wins) or a URL (imageUrl<i>).
 * Remote URLs are downloaded locally; local paths pass through. Returns the
 * ordered, de-blanked gallery.
 */
export async function collectImagesFromForm(fd: FormData, count = 3): Promise<string[]> {
  const images: string[] = [];
  for (let i = 0; i < count; i++) {
    const file = fd.get(`imageFile${i}`);
    if (file instanceof File && file.size > 0) {
      const saved = await saveUploadedImage(file);
      if (saved) {
        images.push(saved);
        continue;
      }
    }
    const raw = fd.get(`imageUrl${i}`);
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    images.push(/^https?:\/\//i.test(url) ? await localizeImage(url) : url);
    // (local /media or /products paths pass through unchanged)
  }
  return images;
}

/** Stores an uploaded image file in the database (MediaAsset), returning its
 *  durable /media/<id> URL. Returns null on any failure (empty file, DB error). */
export async function saveUploadedImage(file: File): Promise<string | null> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) return null;
    return await storeMedia(file.type || "image/jpeg", buf);
  } catch {
    return null;
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
    images: edits.images ? (edits.images as Prisma.InputJsonValue) : undefined,
    origin: edits.origin,
    ribbon: edits.ribbon,
    categorySlug: edits.categorySlug,
    isFeatured: edits.isFeatured,
    isActive: edits.isActive,
    isFragile: edits.isFragile,
    variantPrices: edits.variantPrices ? (edits.variantPrices as Prisma.InputJsonValue) : undefined,
    variantPacks: edits.variantPacks ? (edits.variantPacks as unknown as Prisma.InputJsonValue) : undefined,
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
  if (edits.images !== undefined) {
    data.images = edits.images;
    data.imageUrl = edits.images[0] ?? null;
  } else if (edits.imageUrl !== undefined) {
    data.imageUrl = edits.imageUrl;
  }
  if (edits.origin !== undefined) data.origin = edits.origin;
  if (edits.ribbon !== undefined) data.ribbon = edits.ribbon;
  if (edits.isFeatured !== undefined) data.isFeatured = edits.isFeatured;
  if (edits.isActive !== undefined) data.isActive = edits.isActive;
  if (edits.isFragile !== undefined) data.isFragile = edits.isFragile;
  if (edits.categorySlug !== undefined) data.categoryId = `cat_${edits.categorySlug}`;
  if (Object.keys(data).length) {
    await prisma.product.update({ where: { id: product.id }, data });
  }

  for (const [sku, cents] of Object.entries(edits.variantPrices ?? {})) {
    await prisma.productVariant.updateMany({ where: { sku }, data: { retailPriceCents: cents } });
  }

  for (const [sku, pack] of Object.entries(edits.variantPacks ?? {})) {
    const packData: Record<string, unknown> = {};
    if (pack.size !== undefined && pack.size !== null && pack.size !== "") packData.name = pack.size;
    if (pack.unitsPerCase !== undefined) packData.unitsPerCase = pack.unitsPerCase;
    if (Object.keys(packData).length) {
      await prisma.productVariant.updateMany({ where: { sku }, data: packData });
    }
  }
}

/** Saves cost + selling price for a product from the pricing tool. Updates the
 *  primary variant's price, recomputes minPriceCents, sets the cost, and writes
 *  a durable override so both survive a re-import. */
export async function setProductPricing(
  slug: string,
  sku: string,
  priceCents: number | null,
  costCents: number | null,
  updatedById?: string,
): Promise<void> {
  const prisma = requirePrisma();
  const product = await prisma.product.findUnique({ where: { slug }, include: { variants: true } });
  if (!product) return;

  if (sku) {
    await prisma.productVariant.updateMany({ where: { sku, productId: product.id }, data: { retailPriceCents: priceCents } });
  }
  // Recompute the denormalized lowest price from the fresh variant set.
  const prices = product.variants.map((v) => (v.sku === sku ? priceCents : v.retailPriceCents)).filter((c): c is number => c != null);
  const minPriceCents = prices.length ? Math.min(...prices) : null;

  await prisma.product.update({ where: { id: product.id }, data: { costCents, minPriceCents } });

  const existing = await prisma.productOverride.findUnique({ where: { slug } });
  const variantPrices = { ...((existing?.variantPrices as Record<string, number | null>) ?? {}), ...(sku ? { [sku]: priceCents } : {}) };
  await prisma.productOverride.upsert({
    where: { slug },
    update: { costCents, variantPrices: variantPrices as Prisma.InputJsonValue, updatedById },
    create: { slug, costCents, variantPrices: variantPrices as Prisma.InputJsonValue, updatedById },
  });
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
  images?: string[];
  priceCents?: number | null;
  /** Unit size/weight label, e.g. "70 g". Defaults to "Each". */
  unitSize?: string | null;
  /** Units per wholesale case. */
  unitsPerCase?: number | null;
  isFragile?: boolean;
}

/** Creates an admin-owned (isCustom) product with a single variant. */
export async function createCustomProduct(input: NewProductInput): Promise<void> {
  const prisma = requirePrisma();
  const id = `custom_${input.slug}`;
  const images = (input.images ?? []).filter(Boolean);
  await prisma.product.create({
    data: {
      id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      origin: input.origin ?? null,
      ribbon: input.ribbon ?? null,
      imageUrl: images[0] ?? input.imageUrl ?? null,
      images,
      collections: [],
      isCustom: true,
      isActive: true,
      isFragile: input.isFragile ?? false,
      categoryId: `cat_${input.categorySlug}`,
      variants: {
        create: {
          sku: input.sku,
          name: input.unitSize && input.unitSize.trim() ? input.unitSize.trim() : "Each",
          retailPriceCents: input.priceCents ?? null,
          unitsPerCase: input.unitsPerCase ?? null,
          inStock: true,
          position: 0,
        },
      },
    },
  });
}
