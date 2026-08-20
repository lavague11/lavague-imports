/**
 * Pricing helpers for the admin pricing tool. "Market research" here is grounded
 * in the real retailer prices we scraped (halalco, Fattal's, …): we derive a
 * per-unit price benchmark per category from every priced product, then use it
 * to suggest prices for the unpriced ones by their size.
 */

export type SizeType = "weight" | "volume" | "count";

const WEIGHT: Record<string, number> = { g: 1, gr: 1, gram: 1, grams: 1, kg: 1000, oz: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000, cl: 10, lt: 1000, ltr: 1000, liter: 1000, litre: 1000 };
const COUNT: Record<string, number> = { ct: 1, pc: 1, pcs: 1, piece: 1, pieces: 1, each: 1, ea: 1, pack: 1 };

/** Parse a size label ("70 g", "1 L", "16 oz", "Each") into a base amount
 *  (grams / millilitres / count) and its type. Null if unparseable. */
export function normalizeSize(label: string | null | undefined): { base: number; type: SizeType } | null {
  const s = (label ?? "").toLowerCase();
  const fl = /(\d+(?:\.\d+)?)\s*fl\.?\s*oz\b/.exec(s);
  if (fl) return { base: parseFloat(fl[1]) * 29.5735, type: "volume" };
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|gr|grams?|oz|lbs?|pounds?|ml|cl|ltr|lt|l|liters?|litres?|ct|pcs?|pieces?|each|ea|pack)\b/.exec(s);
  if (!m) {
    if (/\beach\b|\bchaque\b|\bunit\b/.test(s)) return { base: 1, type: "count" };
    return null;
  }
  const val = parseFloat(m[1]);
  const unit = m[2];
  if (unit in WEIGHT) return { base: val * WEIGHT[unit], type: "weight" };
  if (unit in VOLUME) return { base: val * VOLUME[unit], type: "volume" };
  if (unit in COUNT) return { base: val, type: "count" };
  return null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface PricedItem {
  categorySlug: string;
  sizeLabel: string;
  priceCents: number;
}

export interface Benchmarks {
  /** key `${categorySlug}:${type}` → median price (cents) per base unit. */
  perUnit: Map<string, number>;
  /** key categorySlug → median product price (cents), fallback when size is unknown. */
  perProduct: Map<string, number>;
  sampleCount: number;
}

/** Build per-unit and per-product price benchmarks from all priced items. */
export function buildBenchmarks(items: PricedItem[]): Benchmarks {
  const perUnitBuckets = new Map<string, number[]>();
  const perProductBuckets = new Map<string, number[]>();
  for (const it of items) {
    if (it.priceCents == null || it.priceCents <= 0) continue;
    (perProductBuckets.get(it.categorySlug) ?? perProductBuckets.set(it.categorySlug, []).get(it.categorySlug)!).push(it.priceCents);
    const norm = normalizeSize(it.sizeLabel);
    if (!norm || norm.base <= 0) continue;
    const key = `${it.categorySlug}:${norm.type}`;
    (perUnitBuckets.get(key) ?? perUnitBuckets.set(key, []).get(key)!).push(it.priceCents / norm.base);
  }
  const perUnit = new Map<string, number>();
  for (const [k, v] of perUnitBuckets) {
    const m = median(v);
    if (m != null) perUnit.set(k, m);
  }
  const perProduct = new Map<string, number>();
  for (const [k, v] of perProductBuckets) {
    const m = median(v);
    if (m != null) perProduct.set(k, m);
  }
  return { perUnit, perProduct, sampleCount: items.length };
}

/** Round a cents amount to a tidy retail number ending in 9 (e.g. 459, 1299). */
export function tidyPrice(cents: number): number {
  if (cents <= 0) return 0;
  if (cents < 2000) {
    // round to nearest 10c then drop to x9
    const dimes = Math.max(1, Math.round(cents / 10));
    return dimes * 10 - 1;
  }
  // larger items → nearest dollar minus 1c
  return Math.round(cents / 100) * 100 - 1;
}

/** Suggested retail price (cents) for a product from the benchmarks + its size. */
export function suggestPrice(
  categorySlug: string,
  sizeLabel: string,
  benchmarks: Benchmarks,
): number | null {
  const norm = normalizeSize(sizeLabel);
  if (norm && norm.base > 0) {
    const perUnit = benchmarks.perUnit.get(`${categorySlug}:${norm.type}`);
    if (perUnit) return tidyPrice(perUnit * norm.base);
  }
  const perProduct = benchmarks.perProduct.get(categorySlug);
  return perProduct ? tidyPrice(perProduct) : null;
}

/** Profit and margin from a selling price and cost (both cents). */
export function profitMargin(priceCents: number | null, costCents: number | null): {
  profitCents: number | null;
  marginPct: number | null;
} {
  if (priceCents == null || costCents == null) return { profitCents: null, marginPct: null };
  const profitCents = priceCents - costCents;
  const marginPct = priceCents > 0 ? (profitCents / priceCents) * 100 : null;
  return { profitCents, marginPct };
}
