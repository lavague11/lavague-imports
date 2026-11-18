import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { requirePrisma } from "@/lib/db";
import { nameKey } from "@/lib/clean-name";

/* PRODUCTS_UI §17 — "Possible duplicates" cleanup: group look-alikes, merge,
 * mark not-duplicates, and undo a merge from a logged snapshot. */

export interface DupMember {
  slug: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  size: string | null;
  priceCents: number | null;
  invoiceCount: number;
}
export interface DupGroup {
  key: string;
  members: DupMember[];
}

/** Group existing products that look alike (same brand + product core, by the
 *  §13 clean-name key, ignoring size). Dismissed groups are excluded. */
export async function findDuplicateGroups(limit = 100): Promise<{ groups: DupGroup[]; total: number }> {
  const prisma = requirePrisma();
  const products = await prisma.product.findMany({
    select: {
      slug: true, name: true, brand: true, imageUrl: true, minPriceCents: true,
      variants: { orderBy: { position: "asc" }, select: { sku: true, name: true, retailPriceCents: true } },
    },
    orderBy: { name: "asc" },
  });
  const dismissed = new Set((await prisma.productDuplicateDismissal.findMany({ select: { key: true } })).map((d) => d.key));

  const byKey = new Map<string, typeof products>();
  for (const p of products) {
    const k = nameKey(p.name, p.brand, "");
    if (!k) continue;
    const arr = byKey.get(k) ?? [];
    arr.push(p);
    byKey.set(k, arr);
  }
  const raw = [...byKey.entries()].filter(([k, m]) => m.length >= 2 && !dismissed.has(k));
  raw.sort((a, b) => b[1].length - a[1].length);
  const shown = raw.slice(0, limit);

  // Invoice usage per product, by its variant SKUs.
  const allSkus = shown.flatMap(([, m]) => m.flatMap((p) => p.variants.map((v) => v.sku)));
  const usage = new Map<string, number>();
  if (allSkus.length) {
    const rows = await prisma.customerInvoiceLine.groupBy({ by: ["sku"], where: { sku: { in: allSkus } }, _count: { _all: true } });
    for (const r of rows) if (r.sku) usage.set(r.sku, r._count._all);
  }

  const groups: DupGroup[] = shown.map(([key, m]) => ({
    key,
    members: m.map((p) => ({
      slug: p.slug, name: p.name, brand: p.brand, imageUrl: p.imageUrl,
      size: p.variants[0]?.name ?? null,
      priceCents: p.variants[0]?.retailPriceCents ?? p.minPriceCents ?? null,
      invoiceCount: p.variants.reduce((n, v) => n + (usage.get(v.sku) ?? 0), 0),
    })),
  }));
  return { groups, total: raw.length };
}

export async function dismissDuplicateGroup(key: string): Promise<void> {
  const prisma = requirePrisma();
  await prisma.productDuplicateDismissal.upsert({ where: { key }, update: {}, create: { key } });
}

// Product scalar columns we snapshot/recreate on merge+undo.
const PRODUCT_COLS = [
  "id", "slug", "name", "tagline", "description", "origin", "brand", "barcode", "imageUrl", "images",
  "source", "minPriceCents", "ribbon", "collections", "isActive", "isFeatured", "isFragile", "costCents",
  "isCustom", "needsReview", "position", "categoryId", "retailEnabled", "wholesaleEnabled", "wholesalePriceCents",
  "msrpCents", "moqUnits", "casePack", "supplier", "stockUnits", "leadTimeDays",
] as const;
function pickProduct(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of PRODUCT_COLS) if (p[c] !== undefined) out[c] = p[c];
  return out;
}

/**
 * Merge loser products into a survivor: re-parent the losers' variants (keeping
 * their SKUs, so invoices and reorder still resolve), move order-request slugs,
 * drop loser account prices, fold in up to 3 images, delete the empty loser
 * shells. A MergeLog snapshot is written first so it can be undone.
 */
export async function mergeProducts(survivorSlug: string, loserSlugs: string[], actor?: string): Promise<{ moved: number; logId: string | null }> {
  const prisma = requirePrisma();
  const survivor = await prisma.product.findUnique({ where: { slug: survivorSlug }, include: { variants: true } });
  if (!survivor) return { moved: 0, logId: null };
  const losers = await prisma.product.findMany({ where: { slug: { in: loserSlugs.filter((s) => s !== survivorSlug) } }, include: { variants: true } });
  if (!losers.length) return { moved: 0, logId: null };
  const overrides = await prisma.productOverride.findMany({ where: { slug: { in: losers.map((l) => l.slug) } } });

  const snapshot = {
    survivor: { slug: survivor.slug, images: survivor.images, imageUrl: survivor.imageUrl, minPriceCents: survivor.minPriceCents },
    losers: losers.map((l) => ({ product: pickProduct(l as unknown as Record<string, unknown>), variantIds: l.variants.map((v) => v.id) })),
    overrides: overrides.map((o) => o as unknown as Record<string, unknown>),
  };
  const log = await prisma.mergeLog.create({ data: { survivorSlug, snapshot: snapshot as unknown as Prisma.InputJsonValue, actor }, select: { id: true } });

  let pos = survivor.variants.length;
  let moved = 0;
  const images = [...(survivor.images ?? [])];
  for (const L of losers) {
    for (const v of L.variants) {
      await prisma.productVariant.update({ where: { id: v.id }, data: { productId: survivor.id, position: pos++ } });
      moved++;
    }
    await prisma.orderRequestLine.updateMany({ where: { slug: L.slug }, data: { slug: survivorSlug } });
    await prisma.accountProductPrice.deleteMany({ where: { productId: L.id } });
    for (const img of L.images ?? []) { if (images.length >= 3) break; if (!images.includes(img)) images.push(img); }
    await prisma.productOverride.deleteMany({ where: { slug: L.slug } });
    await prisma.product.delete({ where: { id: L.id } });
  }
  const vs = await prisma.productVariant.findMany({ where: { productId: survivor.id }, select: { retailPriceCents: true } });
  const prices = vs.map((v) => v.retailPriceCents).filter((c): c is number => c != null);
  await prisma.product.update({ where: { id: survivor.id }, data: { images, imageUrl: images[0] ?? survivor.imageUrl, minPriceCents: prices.length ? Math.min(...prices) : null } });
  return { moved, logId: log.id };
}

/** Undo a merge: recreate the loser products, move their variants back, restore
 *  overrides and the survivor's images. (Order-request slugs moved to the
 *  survivor are not moved back — a known limitation.) */
export async function undoMerge(logId: string): Promise<{ ok: boolean }> {
  const prisma = requirePrisma();
  const log = await prisma.mergeLog.findUnique({ where: { id: logId } });
  if (!log || log.undoneAt) return { ok: false };
  const snap = log.snapshot as unknown as {
    survivor: { slug: string; images: string[]; imageUrl: string | null; minPriceCents: number | null };
    losers: { product: Record<string, unknown>; variantIds: string[] }[];
    overrides: Record<string, unknown>[];
  };

  for (const l of snap.losers) {
    try {
      await prisma.product.create({ data: pickProduct(l.product) as Prisma.ProductUncheckedCreateInput });
      if (l.variantIds.length) await prisma.productVariant.updateMany({ where: { id: { in: l.variantIds } }, data: { productId: l.product.id as string } });
    } catch (error) {
      console.error("[admin] undoMerge recreate failed", error);
    }
  }
  for (const o of snap.overrides) {
    const data: Record<string, unknown> = { ...o };
    delete data.createdAt;
    delete data.updatedAt;
    delete data.id;
    await prisma.productOverride.upsert({ where: { slug: o.slug as string }, update: data, create: data as Prisma.ProductOverrideUncheckedCreateInput }).catch(() => {});
  }
  await prisma.product.update({ where: { slug: snap.survivor.slug }, data: { images: snap.survivor.images, imageUrl: snap.survivor.imageUrl, minPriceCents: snap.survivor.minPriceCents } }).catch(() => {});
  await prisma.mergeLog.update({ where: { id: logId }, data: { undoneAt: new Date() } });
  return { ok: true };
}
