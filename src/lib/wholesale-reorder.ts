import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * "Usual items" for a wholesale customer — the basis of the Reorder grid and the
 * "Reorder all" button. Prefers the customer's own app order-request history;
 * for customers imported from Invoice ASAP (who have invoices but have never
 * placed an app order), it falls back to their paid invoice history, mapping
 * each line to a catalog product via the variant SKU.
 *
 * Returned items are keyed by product slug and are already restricted to active,
 * wholesale-enabled products. `lastQty` is a best-effort case count the customer
 * reviews in the cart before submitting.
 */
export interface UsualItem {
  slug: string;
  lastQty: number;
  lastAt: number; // epoch ms of the most recent order/invoice containing it
  freq: number; // how many past orders/invoices included it
}

const clampQty = (n: number) => Math.min(999, Math.max(1, Math.round(n) || 1));

/** Usual items from the customer's app order-request history (the original path). */
async function fromOrderRequests(prisma: PrismaClient, customerId: string): Promise<Map<string, UsualItem>> {
  const lines = await prisma.orderRequestLine.findMany({
    where: { request: { customerId }, slug: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { slug: true, cases: true, createdAt: true },
  });
  const out = new Map<string, UsualItem>();
  for (const l of lines) {
    if (!l.slug) continue;
    const e = out.get(l.slug);
    // Rows arrive most-recent first, so the first sighting carries lastQty/lastAt.
    if (!e) out.set(l.slug, { slug: l.slug, lastQty: clampQty(l.cases), lastAt: l.createdAt.getTime(), freq: 1 });
    else e.freq += 1;
  }
  return out;
}

/** Usual items derived from paid-invoice history (imported customers). */
async function fromInvoices(prisma: PrismaClient, customerId: string): Promise<Map<string, UsualItem>> {
  const lines = await prisma.customerInvoiceLine.findMany({
    where: { invoice: { customerId }, isCredit: false, sku: { not: null } },
    orderBy: { invoice: { issueDate: "desc" } },
    take: 3000,
    select: { sku: true, quantity: true, invoice: { select: { issueDate: true } } },
  });

  // Collapse to the most recent quantity + frequency per SKU.
  const bySku = new Map<string, { lastQty: number; lastAt: number; freq: number }>();
  for (const l of lines) {
    const sku = l.sku;
    if (!sku) continue;
    const at = l.invoice.issueDate.getTime();
    const e = bySku.get(sku);
    if (!e) bySku.set(sku, { lastQty: clampQty(l.quantity), lastAt: at, freq: 1 });
    else {
      e.freq += 1;
      if (at > e.lastAt) {
        e.lastAt = at;
        e.lastQty = clampQty(l.quantity);
      }
    }
  }
  if (!bySku.size) return new Map();

  // Map SKU → catalog product (active + wholesale only), collapse to slug.
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: [...bySku.keys()] }, product: { isActive: true, wholesaleEnabled: true } },
    select: { sku: true, product: { select: { slug: true } } },
  });
  const out = new Map<string, UsualItem>();
  for (const v of variants) {
    const e = bySku.get(v.sku);
    if (!e) continue;
    const slug = v.product.slug;
    const prev = out.get(slug);
    if (!prev || e.lastAt > prev.lastAt) {
      out.set(slug, { slug, lastQty: e.lastQty, lastAt: e.lastAt, freq: (prev?.freq ?? 0) + e.freq });
    } else {
      prev.freq += e.freq;
    }
  }
  return out;
}

/**
 * The customer's usual items. App order-request history wins when present;
 * otherwise we fall back to invoice history so imported customers can reorder.
 */
export async function usualItems(prisma: PrismaClient, customerId: string): Promise<Map<string, UsualItem>> {
  const fromOrders = await fromOrderRequests(prisma, customerId);
  if (fromOrders.size) return fromOrders;
  return fromInvoices(prisma, customerId);
}
