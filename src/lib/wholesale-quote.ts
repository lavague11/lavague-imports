import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

// Wholesale quoting (pricing-models.md §3). The quote lives on the OrderRequest:
// admin enters a per-line price, we compute line totals + a subtotal, apply
// discount/shipping/tax, and store the result on the request + its lines.
// Prices are integer cents end to end.

export interface QuoteLineInput {
  id: string;
  cases: number;
  quotedUnitPriceCents: number | null;
}

export interface QuoteAdjustments {
  discountCents: number;
  shippingCents: number;
  taxCents: number;
}

export interface QuoteTotals {
  lineTotals: Record<string, number>; // lineId -> cases × unit
  subtotalCents: number;
  totalCents: number;
}

/** Pure: line totals, subtotal, and grand total. No DB, no rounding surprises —
 *  everything is integer cents. Total is clamped at 0 (a discount never makes
 *  it negative). */
export function computeQuoteTotals(lines: QuoteLineInput[], adj: QuoteAdjustments): QuoteTotals {
  const lineTotals: Record<string, number> = {};
  let subtotal = 0;
  for (const l of lines) {
    const unit = l.quotedUnitPriceCents ?? 0;
    const cases = Number.isFinite(l.cases) ? l.cases : 0;
    const lineTotal = Math.max(0, Math.round(unit) * Math.max(0, cases));
    lineTotals[l.id] = lineTotal;
    subtotal += lineTotal;
  }
  const discount = Math.max(0, Math.round(adj.discountCents || 0));
  const shipping = Math.max(0, Math.round(adj.shippingCents || 0));
  const tax = Math.max(0, Math.round(adj.taxCents || 0));
  const total = Math.max(0, subtotal - discount + shipping + tax);
  return { lineTotals, subtotalCents: subtotal, totalCents: total };
}

/** Parse a dollars string ("24.99", "$1,250", "") into integer cents, or null
 *  when blank/invalid. Tolerant of $ and thousands separators. */
export function dollarsToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Quote lifecycle emails (customer on send; admin on approve/changes) are built
// in @/lib/mail but NOT sent until this flag is turned on — the copy is reviewed
// first (pricing-models.md stage 3). Flip to true to enable sending.
export const QUOTE_EMAILS_ENABLED = false;

export type QuoteAction = "save" | "send";

export interface ApplyQuoteInput {
  lines: QuoteLineInput[];
  adjustments: QuoteAdjustments;
  action: QuoteAction;
}

export interface ApplyQuoteResult {
  ok: boolean;
  status?: string;
  reason?: string;
}

/**
 * The real code path behind the admin quote screen. Writes per-line prices and
 * the request totals; on "send" it marks the request QUOTED and stamps
 * quoteSentAt (the gate that makes the quote visible to the customer in stage 3).
 *
 * Quoting is only allowed from SUBMITTED or CHANGES_REQUESTED (re-quote). A
 * "save" keeps the current status (draft); it never un-sends or advances state.
 */
export async function applyQuote(
  prisma: PrismaClient,
  orderId: string,
  input: ApplyQuoteInput,
): Promise<ApplyQuoteResult> {
  const order = await prisma.orderRequest.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, lines: { select: { id: true, cases: true } } },
  });
  if (!order) return { ok: false, reason: "not-found" };

  const quotable = order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED" || order.status === "QUOTED";
  if (!quotable) return { ok: false, reason: `not-quotable:${order.status}`, status: order.status };

  // Trust the server's own cases, not the form, for the math.
  const casesById = new Map(order.lines.map((l) => [l.id, l.cases]));
  const normalized: QuoteLineInput[] = input.lines
    .filter((l) => casesById.has(l.id))
    .map((l) => ({ id: l.id, cases: casesById.get(l.id)!, quotedUnitPriceCents: l.quotedUnitPriceCents }));

  const totals = computeQuoteTotals(normalized, input.adjustments);

  await prisma.$transaction([
    ...normalized.map((l) =>
      prisma.orderRequestLine.update({
        where: { id: l.id },
        data: {
          quotedUnitPriceCents: l.quotedUnitPriceCents,
          quotedLineTotalCents: l.quotedUnitPriceCents == null ? null : totals.lineTotals[l.id],
        },
      }),
    ),
    prisma.orderRequest.update({
      where: { id: orderId },
      data: {
        quoteSubtotalCents: totals.subtotalCents,
        quoteDiscountCents: input.adjustments.discountCents,
        quoteShippingCents: input.adjustments.shippingCents,
        quoteTaxCents: input.adjustments.taxCents,
        quoteTotalCents: totals.totalCents,
        ...(input.action === "send" ? { status: "QUOTED" as const, quoteSentAt: new Date() } : {}),
      },
    }),
  ]);

  return { ok: true, status: input.action === "send" ? "QUOTED" : order.status };
}

// --------------------------------------------------------------------------
// Customer side (pricing-models.md stage 3). Both are owner-gated: the order
// must belong to `customerId`, or they return not-owner and change nothing.
// --------------------------------------------------------------------------

export interface CustomerActionResult {
  ok: boolean;
  reason?: string;
}

/** Customer approves a sent quote → APPROVED + approvedAt. Only the owning
 *  customer, and only from a QUOTED+sent quote. */
export async function approveQuote(
  prisma: PrismaClient,
  orderId: string,
  customerId: string,
): Promise<CustomerActionResult> {
  const order = await prisma.orderRequest.findUnique({
    where: { id: orderId },
    select: { customerId: true, status: true, quoteSentAt: true },
  });
  if (!order) return { ok: false, reason: "not-found" };
  if (order.customerId !== customerId) return { ok: false, reason: "not-owner" };
  if (order.status !== "QUOTED" || order.quoteSentAt == null) return { ok: false, reason: `not-approvable:${order.status}` };

  await prisma.orderRequest.update({
    where: { id: orderId },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
  return { ok: true };
}

/** Customer requests changes → CHANGES_REQUESTED + note, and optionally new case
 *  quantities per line. Only the owning customer, only from a QUOTED quote. */
export async function requestQuoteChanges(
  prisma: PrismaClient,
  orderId: string,
  customerId: string,
  input: { note: string; caseEdits?: Record<string, number> },
): Promise<CustomerActionResult> {
  const order = await prisma.orderRequest.findUnique({
    where: { id: orderId },
    select: { customerId: true, status: true, lines: { select: { id: true } } },
  });
  if (!order) return { ok: false, reason: "not-found" };
  if (order.customerId !== customerId) return { ok: false, reason: "not-owner" };
  if (order.status !== "QUOTED") return { ok: false, reason: `not-changeable:${order.status}` };

  const ownLineIds = new Set(order.lines.map((l) => l.id));
  const edits = Object.entries(input.caseEdits ?? {})
    .filter(([lineId, cases]) => ownLineIds.has(lineId) && Number.isFinite(cases) && cases >= 1)
    .map(([lineId, cases]) => ({ lineId, cases: Math.min(Math.round(cases), 9999) }));

  await prisma.$transaction([
    ...edits.map((e) =>
      prisma.orderRequestLine.update({
        where: { id: e.lineId },
        // Cases changed; the old quoted line total is stale until admin re-quotes.
        data: { cases: e.cases, quotedLineTotalCents: null },
      }),
    ),
    prisma.orderRequest.update({
      where: { id: orderId },
      data: { status: "CHANGES_REQUESTED", customerChangeNote: input.note.trim() || null },
    }),
  ]);
  return { ok: true };
}
