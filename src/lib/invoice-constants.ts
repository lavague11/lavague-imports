// Client-safe invoice constants/helpers (no server-only imports), so both the
// editor UI and the server routes share one source of truth.

/** Section G — wholesale order minimum, enforced at quote/invoice time. */
export const WHOLESALE_MINIMUM_CENTS = 50_000; // $500

export const INVOICE_TERMS = [
  "Due on receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 45",
] as const;

export const PAYMENT_METHODS = ["CHECK", "CASH", "CARD", "ACH", "WIRE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function paymentMethodLabel(m: string): string {
  switch (m) {
    case "CHECK": return "Check";
    case "CASH": return "Cash";
    case "CARD": return "Card";
    case "ACH": return "ACH";
    case "WIRE": return "Wire";
    default: return "Other";
  }
}

/** Parse a dollars string (e.g. "12.50") to integer cents; blank/invalid → 0. */
export function dollarsToCents(v: string | null | undefined): number {
  const t = (v ?? "").trim().replace(/[$,]/g, "");
  if (t === "") return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Days to add to the issue date for a terms label (null = no due date). */
export function termsDueDays(terms: string | null | undefined): number | null {
  if (!terms) return null;
  const m = terms.match(/net\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (/receipt/i.test(terms)) return 0;
  return null;
}

/** Credit reasons for invoice credit lines (Add credit + credits by voice). */
export const CREDIT_REASONS = [
  "Damaged",
  "Expired",
  "Returned",
  "Short delivery",
  "Courtesy",
  "Price adjustment",
  "Other",
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

/** Terms dropdown for the editor (due date auto-calculates from these). */
export const TERMS_OPTIONS = ["Due on receipt", "Net 7", "Net 15", "Net 30", "Net 60"] as const;

/** Internal sales-rep suggestions (typable combobox; default Waleed). */
export const SALES_REPS = ["Waleed", "Ahmed", "Sam"] as const;
