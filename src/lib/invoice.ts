import "server-only";

import { randomBytes } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { dollarsToCents } from "@/lib/invoice-constants";

// Re-export the client-safe constants so server callers can keep one import.
export {
  WHOLESALE_MINIMUM_CENTS,
  INVOICE_TERMS,
  PAYMENT_METHODS,
  paymentMethodLabel,
  dollarsToCents,
  termsDueDays,
  type PaymentMethod,
} from "@/lib/invoice-constants";

export type InvoiceStatusKey = "draft" | "void" | "paid" | "overdue" | "partial" | "open";

export interface InvoiceLike {
  status: string; // DRAFT | SENT | PARTIAL | PAID | VOID
  totalCents: number;
  paidCents: number;
  dueDate: Date | null;
}

export interface InvoiceDisplay {
  key: InvoiceStatusKey;
  label: string;
  badge: string;
}

/**
 * Derive the status shown in the UI. The stored enum is DRAFT/SENT/PARTIAL/PAID/
 * VOID; "Overdue" is computed from the due date + balance, never stored.
 */
export function invoiceDisplay(i: InvoiceLike, now: Date = new Date()): InvoiceDisplay {
  const balance = i.totalCents - i.paidCents;
  if (i.status === "VOID") return { key: "void", label: "Void", badge: "bg-olive-100 text-olive-500" };
  if (i.status === "DRAFT") return { key: "draft", label: "Draft", badge: "bg-olive-100 text-olive-600" };
  if (balance <= 0 && i.totalCents > 0) return { key: "paid", label: "Paid", badge: "bg-emerald-100 text-emerald-700" };
  if (i.dueDate && i.dueDate < now && balance > 0) return { key: "overdue", label: "Overdue", badge: "bg-red-100 text-red-700" };
  if (i.paidCents > 0) return { key: "partial", label: "Partial", badge: "bg-amber-100 text-amber-800" };
  return { key: "open", label: "Open", badge: "bg-sky-100 text-sky-800" };
}

type HasNumberSeries = Pick<PrismaClient, "numberSeries">;

/**
 * Mint the next LV-#### number with a single atomic UPDATE (race-safe). The
 * series row is seeded by migration 007; the create is only a cold-start guard.
 */
export async function mintInvoiceNumber(db: HasNumberSeries): Promise<string> {
  try {
    const row = await db.numberSeries.update({
      where: { key: "invoice" },
      data: { value: { increment: 1 } },
    });
    return `LV-${String(row.value).padStart(4, "0")}`;
  } catch {
    const row = await db.numberSeries.create({ data: { key: "invoice", value: 1 } });
    return `LV-${String(row.value).padStart(4, "0")}`;
  }
}

/** A URL-safe token for the customer-facing invoice link. */
export function newPublicToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The stored status implied by totals + the previous status. DRAFT stays DRAFT
 * (until explicitly sent) and VOID stays VOID; otherwise it reflects payment.
 */
export function settledStatus(
  totalCents: number,
  paidCents: number,
  prev: string,
): "DRAFT" | "SENT" | "PARTIAL" | "PAID" | "VOID" {
  if (prev === "VOID") return "VOID";
  if (prev === "DRAFT") return "DRAFT";
  if (totalCents > 0 && paidCents >= totalCents) return "PAID";
  if (paidCents > 0) return "PARTIAL";
  return "SENT";
}

export interface ParsedLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** Zip the repeated desc/qty/unit fields of the editor form into clean lines. */
export function parseLines(fd: FormData): ParsedLine[] {
  const descs = fd.getAll("desc").map(String);
  const qtys = fd.getAll("qty").map(String);
  const units = fd.getAll("unit").map(String);
  const out: ParsedLine[] = [];
  for (let i = 0; i < descs.length; i += 1) {
    const description = descs[i].trim();
    if (!description) continue;
    const quantity = Math.max(0, Math.round(Number(qtys[i]) || 0));
    const unitPriceCents = dollarsToCents(units[i]);
    out.push({ description, quantity, unitPriceCents, lineTotalCents: quantity * unitPriceCents });
  }
  return out;
}

export function computeTotals(
  lines: Array<{ lineTotalCents: number }>,
  discountCents: number,
  shippingCents: number,
  taxCents: number,
): { subtotalCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents + taxCents);
  return { subtotalCents, totalCents };
}
