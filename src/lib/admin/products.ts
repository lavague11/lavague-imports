import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { requirePrisma } from "@/lib/db";
import { formatUnitSize } from "@/lib/units";

/** A size/pack to create as a new ProductVariant. */
export interface SeedVariant {
  size?: string | null;
  unitsPerCase?: number | null;
  priceCents?: number | null;
}

/** Parse the "+ Add size" rows from a submitted form (repeated newSize* fields,
 *  index-aligned). Returns only rows that carry some content. */
export function parseNewSizeRows(fd: FormData): SeedVariant[] {
  const amounts = fd.getAll("newSizeAmount").map(String);
  const units = fd.getAll("newSizeUnit").map(String);
  const cases = fd.getAll("newCase").map(String);
  const prices = fd.getAll("newPrice").map(String);
  const n = Math.max(amounts.length, units.length, cases.length, prices.length);
  const rows: SeedVariant[] = [];
  for (let i = 0; i < n; i++) {
    const size = formatUnitSize(amounts[i] ?? "", units[i] ?? "");
    const caseNum = parseInt((cases[i] ?? "").trim(), 10);
    const priceStr = (prices[i] ?? "").trim();
    const row: SeedVariant = {
      size,
      unitsPerCase: Number.isFinite(caseNum) && caseNum > 0 ? caseNum : null,
      priceCents: priceStr ? Math.round(parseFloat(priceStr) * 100) : null,
    };
    rows.push(row);
  }
  return rows;
}

const hasContent = (v: SeedVariant) =>
  (v.size != null && v.size.trim() !== "" && v.size.trim().toLowerCase() !== "each") ||
  v.unitsPerCase != null ||
  v.priceCents != null;

/** Create new sizes (variants) on an existing product and recompute its
 *  denormalized lowest price. Skips empty rows; generates unique SKUs. */
export async function addProductSizes(slug: string, rows: SeedVariant[]): Promise<void> {
  const prisma = requirePrisma();
  const clean = rows.filter(hasContent);
  if (!clean.length) return;
  const product = await prisma.product.findUnique({ where: { slug }, include: { variants: true } });
  if (!product) return;

  const base = (product.variants[0]?.sku ?? `LV-${slug}`.toUpperCase()).slice(0, 30);
  const used = new Set(product.variants.map((v) => v.sku));
  let pos = product.variants.length;
  const data = clean.map((v, i) => {
    let sku = `${base}-${pos + i + 1}`.slice(0, 40);
    while (used.has(sku)) sku = `${base}-${pos + i + 1}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 40);
    used.add(sku);
    return {
      sku,
      name: v.size && v.size.trim() ? v.size.trim() : "Each",
      productId: product.id,
      retailPriceCents: v.priceCents ?? null,
      unitsPerCase: v.unitsPerCase ?? null,
      inStock: true,
      position: pos + i,
    };
  });
  await prisma.productVariant.createMany({ data, skipDuplicates: true });

  const prices = [...product.variants.map((v) => v.retailPriceCents), ...clean.map((v) => v.priceCents ?? null)].filter(
    (c): c is number => c != null,
  );
  await prisma.product.update({ where: { id: product.id }, data: { minPriceCents: prices.length ? Math.min(...prices) : null } });
}

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
  brand?: string | null;
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

  // New single multi-file picker ("images"): the first `count` uploads win.
  const multi = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of multi.slice(0, count)) {
    const saved = await saveUploadedImage(file);
    if (saved) images.push(saved);
  }
  if (images.length > 0) return images;

  // Legacy per-slot fields (imageFile<i> / imageUrl<i>) — used by the edit form.
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
  if (edits.brand !== undefined) data.brand = edits.brand;
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

/* ---- draft / publish (PRODUCTS_UI §9) ---- */

/** Autosave pending edits as a draft — NOT applied to the live product. */
export async function saveDraft(slug: string, edits: ProductEdits): Promise<void> {
  const prisma = requirePrisma();
  const data = { draft: edits as unknown as Prisma.InputJsonValue, draftUpdatedAt: new Date() };
  await prisma.productOverride.upsert({ where: { slug }, update: data, create: { slug, ...data } });
}

/** Discard any unpublished draft for a product. */
export async function clearDraft(slug: string): Promise<void> {
  const prisma = requirePrisma();
  await prisma.productOverride.updateMany({ where: { slug }, data: { draft: Prisma.DbNull, draftUpdatedAt: null } });
}

/** Merge a single variant price into the draft (used by inline/quick edits,
 *  which per §9 save as drafts rather than publishing). */
export async function saveDraftPrice(slug: string, sku: string, cents: number | null): Promise<void> {
  const prisma = requirePrisma();
  const ov = await prisma.productOverride.findUnique({ where: { slug }, select: { draft: true } });
  const draft: ProductEdits = ov?.draft && typeof ov.draft === "object" ? { ...(ov.draft as ProductEdits) } : {};
  draft.variantPrices = { ...(draft.variantPrices ?? {}), [sku]: cents };
  await saveDraft(slug, draft);
}

/** Apply a product's stored draft to the live product, then clear it. */
export async function publishDraft(slug: string, updatedById?: string): Promise<void> {
  const prisma = requirePrisma();
  const ov = await prisma.productOverride.findUnique({ where: { slug }, select: { draft: true } });
  const draft = ov?.draft as ProductEdits | null;
  if (draft && typeof draft === "object") await saveProductEdits(slug, draft, updatedById);
  await clearDraft(slug);
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

/** Bulk-set (or clear) the brand on the given products. Live product only;
 *  blank clears it back to "No brand". */
export async function setProductsBrand(slugs: string[], brand: string | null): Promise<void> {
  if (!slugs.length) return;
  const prisma = requirePrisma();
  await prisma.product.updateMany({ where: { slug: { in: slugs } }, data: { brand: brand && brand.trim() ? brand.trim() : null } });
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
  brand?: string | null;
  barcode?: string | null;
  ribbon?: string | null;
  imageUrl?: string | null;
  images?: string[];
  priceCents?: number | null;
  /** Unit size/weight label, e.g. "70 g". Defaults to "Each". */
  unitSize?: string | null;
  /** Units per wholesale case. */
  unitsPerCase?: number | null;
  isFragile?: boolean;
  /** Hidden from the storefront + queued for admin review (invoice photo/voice). */
  isActive?: boolean;
  needsReview?: boolean;
  /** Additional sizes beyond the primary variant (from the "+ Add size" table). */
  extraVariants?: SeedVariant[];
}

/** Creates an admin-owned (isCustom) product with a single variant. Returns its identity. */
export async function createCustomProduct(
  input: NewProductInput,
): Promise<{ slug: string; sku: string; imageUrl: string | null }> {
  const prisma = requirePrisma();
  // Ensure a unique product id/slug (photo/voice can repeat names).
  let slug = input.slug;
  if (await prisma.product.findUnique({ where: { id: `custom_${slug}` }, select: { id: true } })) {
    slug = `${input.slug}-${Date.now().toString(36).slice(-4)}`;
  }
  const id = `custom_${slug}`;
  const images = (input.images ?? []).filter(Boolean);
  const imageUrl = images[0] ?? input.imageUrl ?? null;
  await prisma.product.create({
    data: {
      id,
      slug,
      name: input.name,
      description: input.description,
      origin: input.origin ?? null,
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      ribbon: input.ribbon ?? null,
      imageUrl,
      images,
      collections: [],
      isCustom: true,
      isActive: input.isActive ?? true,
      needsReview: input.needsReview ?? false,
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

  // Additional sizes from the "+ Add size" table.
  const extras = (input.extraVariants ?? []).filter(hasContent);
  if (extras.length) {
    const used = new Set<string>([input.sku]);
    const data = extras.map((v, i) => {
      let sku = `${input.sku}-${i + 2}`.slice(0, 40);
      while (used.has(sku)) sku = `${input.sku}-${i + 2}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 40);
      used.add(sku);
      return {
        sku,
        name: v.size && v.size.trim() ? v.size.trim() : "Each",
        productId: id,
        retailPriceCents: v.priceCents ?? null,
        unitsPerCase: v.unitsPerCase ?? null,
        inStock: true,
        position: i + 1,
      };
    });
    await prisma.productVariant.createMany({ data, skipDuplicates: true });
  }

  // Denormalized lowest price across all variants.
  const prices = [input.priceCents ?? null, ...extras.map((v) => v.priceCents ?? null)].filter((c): c is number => c != null);
  if (prices.length) {
    await prisma.product.update({ where: { id }, data: { minPriceCents: Math.min(...prices) } });
  }

  return { slug, sku: input.sku, imageUrl };
}
