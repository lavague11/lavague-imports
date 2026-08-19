import "server-only";

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

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
  /** Per-variant price in cents, keyed by SKU. null clears the price. */
  variantPrices?: Record<string, number | null>;
  /** Per-variant pack (size + units per case), keyed by SKU. */
  variantPacks?: Record<string, VariantPack>;
}

const IMG_DIR = path.join(process.cwd(), "public", "products", "custom");

function extFromType(type: string): string {
  return type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
}

/**
 * Downloads a remote image into public/products/custom so the storefront serves
 * it locally (no per-host next.config wiring, no hotlinking). Returns the local
 * path, or the original URL if the download fails. `index` disambiguates the
 * filename so a product can carry several photos. Note: writes to the local
 * filesystem — for a serverless host, swap this for object storage.
 */
export async function localizeImage(slug: string, url: string, index = 0): Promise<string> {
  if (!url || url.startsWith("/products/")) return url;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return url;
    const ext = extFromType(res.headers.get("content-type") ?? "");
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(IMG_DIR, { recursive: true });
    const file = `${slug}-${index}.${ext}`;
    await writeFile(path.join(IMG_DIR, file), buf);
    return `/products/custom/${file}`;
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
export async function collectImagesFromForm(fd: FormData, slug: string, count = 3): Promise<string[]> {
  const images: string[] = [];
  for (let i = 0; i < count; i++) {
    const file = fd.get(`imageFile${i}`);
    if (file instanceof File && file.size > 0) {
      const saved = await saveUploadedImage(slug, file, i);
      if (saved) {
        images.push(saved);
        continue;
      }
    }
    const raw = fd.get(`imageUrl${i}`);
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    images.push(/^https?:\/\//i.test(url) ? await localizeImage(slug, url, i) : url);
  }
  return images;
}

/** Stores an uploaded image file under public/products/custom, returning its
 *  local path. Returns null on any failure (empty file, write error). */
export async function saveUploadedImage(slug: string, file: File, index = 0): Promise<string | null> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
  try {
    const ext = extFromType(file.type || "");
    const buf = Buffer.from(await file.arrayBuffer());
    await mkdir(IMG_DIR, { recursive: true });
    const name = `${slug}-up${index}.${ext}`;
    await writeFile(path.join(IMG_DIR, name), buf);
    return `/products/custom/${name}`;
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
