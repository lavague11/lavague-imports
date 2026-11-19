import "server-only";

// Fuzzy customer matching for voice orders. Handles English misspellings and
// spoken Arabic (e.g. "للزعيم" → "El Zaeem Market") by transliterating Arabic to
// Latin, stripping articles/prepositions, and scoring on bigram similarity. The
// ranking produces a shortlist; an LLM pass (in the match route) picks the best.

export interface CustomerRow {
  id: string;
  businessName: string | null;
  name: string | null;
  phone: string | null;
}
export interface RankedCustomer {
  id: string;
  label: string;
  score: number;
}

const AR_DIACRITICS = /[ً-ٰٟ]/g;

function normalizeArabic(s: string): string {
  return s
    .replace(AR_DIACRITICS, "")
    .replace(/[آأإٱ]/g, "ا") // alef variants → ا
    .replace(/ى/g, "ي") // alef maksura → ي
    .replace(/ة/g, "ه"); // ta marbuta → ه
}

// Rough Arabic → Latin transliteration, enough to line up distinctive tokens.
const AR2LAT: Record<string, string> = {
  "ا": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s",
  "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q",
  "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y",
  "ء": "", "ئ": "y", "ؤ": "w", "ة": "a", "ى": "a", "پ": "p", "چ": "ch", " گ": "g",
};

function transliterate(s: string): string {
  return normalizeArabic(s)
    .split("")
    .map((c) => (c in AR2LAT ? AR2LAT[c] : c))
    .join("");
}

// Articles / prepositions to drop, English and (transliterated) Arabic.
const STOP = new Set([
  "invoice", "for", "to", "the", "make", "this", "its", "it", "is", "a", "an", "of", "and",
  "al", "el", "ll", "la", "le", "li", "lil", "hadha", "hadhi", "da", "di", "dah", "deh",
]);

// Generic business words — too common to drive a match, so they're dropped too.
// (Keeps "Blarghwfj Zzz Store" from matching any "… Store".)
const GENERIC = new Set([
  "store", "stores", "shop", "shops", "market", "markets", "supermarket", "supermarkets",
  "mart", "grocery", "groceries", "deli", "halal", "meat", "meats", "food", "foods",
  "restaurant", "cafe", "bakery", "llc", "inc", "corp", "co", "company", "trading",
  "wholesale", "international", "intl", "bazaar", "depot", "supply", "distributors",
  "distribution", "enterprises", "group", "brothers", "bros",
]);

/** Canonical comparison form: transliterated, lowercased, de-articled, alnum. */
export function canon(s: string): string {
  let t = transliterate(s).toLowerCase();
  // Split a leading al-/el-/ll-/lil- glued onto a token ("llzaym" → "ll zaym").
  t = t.replace(/\b(lil|ll|al|el|la|le)([a-z]{3,})/g, "$1 $2");
  t = t.replace(/[^a-z0-9\s]+/g, " ");
  const tokens = t.split(/\s+/).filter((w) => w && !STOP.has(w) && !GENERIC.has(w));
  return tokens.join(" ");
}

function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2));
  return set;
}

function dice(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return (2 * inter) / (A.size + B.size);
}

function scoreOne(spoken: string, row: CustomerRow): number {
  const sp = canon(spoken);
  const cu = canon(`${row.businessName ?? ""} ${row.name ?? ""}`);
  if (!sp || !cu) return 0;
  const spTokens = sp.split(" ").filter(Boolean);
  const cuTokens = cu.split(" ").filter(Boolean);

  let tokenBest = 0;
  for (const s of spTokens) {
    for (const c of cuTokens) {
      const d = dice(s, c);
      const pref = s.length >= 3 && c.startsWith(s.slice(0, 3)) ? 0.3 : 0;
      tokenBest = Math.max(tokenBest, d + pref);
    }
  }
  const whole = dice(sp, cu);
  const overlap =
    spTokens.filter((s) => cuTokens.some((c) => c.includes(s) || s.includes(c))).length /
    Math.max(1, spTokens.length);
  return Math.min(1, Math.max(tokenBest, whole) * 0.7 + overlap * 0.3);
}

export function labelFor(row: CustomerRow): string {
  return row.businessName || row.name || "Customer";
}

/** Rank customers by similarity to a spoken name, strongest first. */
export function rankCustomers(rows: CustomerRow[], spoken: string, limit = 60): RankedCustomer[] {
  const n = spoken.trim();
  if (n.length < 2) return [];
  return rows
    .map((r) => ({ id: r.id, label: labelFor(r), score: scoreOne(n, r) }))
    .filter((r) => r.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// A fuzzy score at/above this is "reasonably close" even without the LLM pass.
export const CLOSE_ENOUGH = 0.42;
