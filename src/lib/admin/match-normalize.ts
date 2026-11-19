import "server-only";

import { normText, parseSize } from "@/lib/admin/product-tags";

// Normalization shared by tag storage and voice-utterance matching
// (PRODUCT_TAGS §2). Arabic folding lives in normText; this adds Arabizi digits
// and a size-word lexicon.

// Arabizi (Franco-Arabic) chat numerals → Latin approximations. Applied only to
// a single digit touching a letter and NOT part of a multi-digit number, so
// sizes/quantities ("16", "500") are untouched while "7alib" → "halib".
const ARABIZI: Record<string, string> = { "2": "", "3": "a", "4": "gh", "5": "kh", "6": "t", "7": "h", "8": "gh", "9": "q" };

export function foldArabizi(input: string): string {
  return input.replace(
    /(?<![0-9])(?<=[a-z])[2-9](?![0-9])|(?<![0-9])[2-9](?=[a-z])(?![0-9])/gi,
    (d) => ARABIZI[d] ?? d,
  );
}

// Size words (English / Darija / Arabic) → an absolute size, or a relative hint.
interface SizeWord { amount?: number; unit?: "ml" | "g" | "piece"; rel?: "large" | "small" }
const SIZE_WORDS: Record<string, SizeWord> = {
  kilo: { amount: 1000, unit: "g" }, kil: { amount: 1000, unit: "g" }, "كيلو": { amount: 1000, unit: "g" },
  litre: { amount: 1000, unit: "ml" }, liter: { amount: 1000, unit: "ml" }, "لتر": { amount: 1000, unit: "ml" },
  kbir: { rel: "large" }, kbira: { rel: "large" }, "كبير": { rel: "large" }, "كبيرة": { rel: "large" }, large: { rel: "large" }, big: { rel: "large" },
  sghir: { rel: "small" }, sghira: { rel: "small" }, "صغير": { rel: "small" }, "صغيرة": { rel: "small" }, small: { rel: "small" },
};

/** Pull a size hint out of free text: an explicit size (70 g, 1 L), a size word
 *  (kilo, litre), or a relative hint (kbir/sghir). */
export function extractSizeHint(text: string): { amount: number; unit: "ml" | "g" | "piece" } | { rel: "large" | "small" } | null {
  const explicit = text.match(/(\d+(?:[.,]\d+)?)\s*(l|liter|litre|ml|cl|kg|kilo|g|gr|gram|grams|oz|lb|pcs?|pieces?|ct|count)\b/i);
  if (explicit) {
    const s = parseSize(`${explicit[1]} ${explicit[2]}`);
    if (s) return s;
  }
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const w of words) {
    const sw = SIZE_WORDS[w];
    if (sw) {
      if (sw.amount && sw.unit) return { amount: sw.amount, unit: sw.unit };
      if (sw.rel) return { rel: sw.rel };
    }
  }
  return null;
}

/** Full utterance normalization → a normalized string + token set for matching. */
export function normalizeUtterance(text: string): { norm: string; tokens: string[] } {
  const norm = normText(foldArabizi(text));
  const tokens = norm.split(" ").filter((t) => t.length >= 2);
  return { norm, tokens };
}

// --- small similarity helper (bigram Dice), shared by the tag matcher ---------
function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2));
  return set;
}
export function diceSim(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return (2 * inter) / (A.size + B.size);
}
