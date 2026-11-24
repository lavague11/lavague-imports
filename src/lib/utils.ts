import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Prices are stored as integer cents everywhere; format only at the edge. */
export function formatPrice(cents: number) {
  return currency.format(cents / 100);
}

export const PRICE_ON_REQUEST = "Price on request";

/** Formats a nullable price, falling back to the quote-only label. */
export function formatPriceOrRequest(cents: number | null | undefined) {
  return cents == null ? PRICE_ON_REQUEST : currency.format(cents / 100);
}

/**
 * Customer-facing SKU: hides Amazon fulfillment tags (FBA / FBM) that leaked in
 * from imported listings, while the raw SKU stays as the internal/admin value.
 * Only strips FBA/FBM when they appear as a standalone token (preceded by a
 * space or dash), so real product codes that merely contain the letters — e.g.
 * "CFBAB37", "CFBA4/4" — are left untouched.
 */
export function publicSku(sku: string | null | undefined): string {
  if (!sku) return "";
  return sku
    .replace(/[\s\-–]+(?:FBA|FBM)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Generates a short, human-readable reference like `LVQ-7K3M2A`. */
export function makeReference(prefix: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}-${suffix}`;
}
