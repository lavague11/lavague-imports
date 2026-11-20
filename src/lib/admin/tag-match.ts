import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { normText } from "@/lib/admin/product-tags";
import { diceSim, extractSizeHint, normalizeUtterance } from "@/lib/admin/match-normalize";
import { searchCatalog, type CatalogHit } from "@/lib/admin/voice-catalog";

// Tag-first voice matching (PRODUCT_TAGS §2). Rank: customer history → tag match
// → fuzzy name → fallback. Pure resolution (no LLM) so it's testable by the
// accuracy harness. Returns the best product + alternatives, or flags a vague
// utterance for "which brand and size?".

export interface ResolvedMatch extends CatalogHit {
  source: "history" | "tag" | "fuzzy";
  confidence: number;
  usualQty: number | null;
}
export interface ResolveResult {
  match: ResolvedMatch | null;
  alternatives: CatalogHit[];
  vague: boolean;
  /** Low confidence or top-2 close → the card should show a picker (stage 3). */
  ambiguous: boolean;
}

const HISTORY_MIN = 0.45;
const FUZZY_MIN = 0.5;
const CONFIDENT = 0.72;

async function hitForSku(prisma: PrismaClient, sku: string): Promise<CatalogHit | null> {
  const v = await prisma.productVariant.findUnique({
    where: { sku },
    select: { sku: true, name: true, retailPriceCents: true, product: { select: { name: true, brand: true, imageUrl: true, isActive: true } } },
  });
  if (!v || !v.product) return null;
  return { name: v.product.name, brand: v.product.brand, sku: v.sku, packSize: v.name, priceCents: v.retailPriceCents, imageUrl: v.product.imageUrl };
}

const mode = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const count = new Map<number, number>();
  for (const n of nums) count.set(n, (count.get(n) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/** 1. This customer's purchase history. */
async function fromHistory(prisma: PrismaClient, queryNorm: string, customerId: string): Promise<ResolvedMatch | null> {
  const lines = await prisma.customerInvoiceLine.findMany({
    where: { invoice: { customerId, status: { not: "VOID" } }, isCredit: false, sku: { not: null } },
    select: { sku: true, description: true, quantity: true },
    orderBy: { invoice: { issueDate: "desc" } },
    take: 800,
  });
  if (!lines.length) return null;
  const bySku = new Map<string, { descs: string[]; qtys: number[] }>();
  for (const l of lines) {
    if (!l.sku) continue;
    const e = bySku.get(l.sku) ?? { descs: [], qtys: [] };
    e.descs.push(l.description);
    e.qtys.push(l.quantity);
    bySku.set(l.sku, e);
  }
  let best: { sku: string; score: number; qtys: number[] } | null = null;
  for (const [sku, e] of bySku) {
    const score = Math.max(...e.descs.map((d) => diceSim(queryNorm, normText(d))));
    if (!best || score > best.score) best = { sku, score, qtys: e.qtys };
  }
  if (!best || best.score < HISTORY_MIN) return null;
  const hit = await hitForSku(prisma, best.sku);
  if (!hit) return null;
  return { ...hit, source: "history", confidence: best.score, usualQty: mode(best.qtys) };
}

/** 2. Tag match — brand/type/size/variant/spoken agreement. Dormant until tags
 *  are backfilled (stage 7); active immediately for hand-tagged products. */
async function fromTags(
  prisma: PrismaClient,
  tokens: string[],
  brandNorm: string,
  sizeHint: ReturnType<typeof extractSizeHint>,
): Promise<ResolvedMatch | null> {
  if (tokens.length === 0) return null;
  const tags = await prisma.productTag.findMany({
    where: { OR: tokens.map((t) => ({ norm: { contains: t } })) },
    select: { slug: true, kind: true, norm: true, sizeAmount: true, sizeUnit: true },
    take: 400,
  });
  if (!tags.length) return null;

  const bySlug = new Map<string, { facets: Set<string>; score: number }>();
  for (const tag of tags) {
    const e = bySlug.get(tag.slug) ?? { facets: new Set<string>(), score: 0 };
    const matched = tokens.some((t) => tag.norm.includes(t) || t.includes(tag.norm));
    if (!matched) continue;
    e.facets.add(tag.kind);
    // Weight: spoken/brand are strong signals; size agreement is a strong signal.
    e.score += tag.kind === "SPOKEN" ? 1 : tag.kind === "BRAND" ? 1 : 0.6;
    if (tag.kind === "BRAND" && brandNorm && tag.norm.includes(brandNorm)) e.score += 0.5;
    if (tag.kind === "SIZE" && sizeHint && "amount" in sizeHint && tag.sizeAmount === sizeHint.amount && tag.sizeUnit === sizeHint.unit) {
      e.facets.add("SIZE_MATCH");
      e.score += 1;
    }
    bySlug.set(tag.slug, e);
  }
  const ranked = [...bySlug.entries()].sort((a, b) => b[1].score - a[1].score);
  if (!ranked.length) return null;
  const [slug, top] = ranked[0];
  // Need a real signal: a spoken/brand hit, or type+size agreement.
  const strong = top.facets.has("SPOKEN") || top.facets.has("BRAND") || (top.facets.has("TYPE") && top.facets.has("SIZE_MATCH"));
  if (!strong) return null;
  const variant = await prisma.productVariant.findFirst({
    where: { product: { slug } },
    orderBy: { position: "asc" },
    select: { sku: true, name: true, retailPriceCents: true, product: { select: { name: true, brand: true, imageUrl: true } } },
  });
  if (!variant?.product) return null;
  return {
    name: variant.product.name, brand: variant.product.brand, sku: variant.sku, packSize: variant.name,
    priceCents: variant.retailPriceCents, imageUrl: variant.product.imageUrl,
    source: "tag", confidence: Math.min(1, top.score / 2.5), usualQty: null,
  };
}

/** A fuzzy hit that rode on a shared generic/type word while the speaker named a
 *  clearly DIFFERENT brand (e.g. "Schweppes pomegranate" → "Snaps Pomegranate")
 *  is a cross-brand substitution, not a match. Flag "not in catalog" and offer the
 *  near-miss in the picker rather than silently swapping the brand. */
function brandConflicts(spokenBrandNorm: string, hit: CatalogHit): boolean {
  if (!spokenBrandNorm) return false; // no brand was named → nothing to conflict with
  const hitBrand = normText(hit.brand ?? "");
  const hitName = normText(hit.name);
  // Spoken brand shows up in the product (same brand, or carried in the name) → fine.
  if (hitBrand && (hitBrand.includes(spokenBrandNorm) || spokenBrandNorm.includes(hitBrand))) return false;
  if (hitName.includes(spokenBrandNorm)) return false;
  // Tolerate a misspelled/transliterated brand (e.g. "Dary" vs "Dari").
  if (hitBrand && diceSim(spokenBrandNorm, hitBrand) >= 0.5) return false;
  // A brand was named, it's nowhere in this product, and it isn't a near-spelling → different brand.
  return true;
}

/** Resolve one spoken item to a product. */
export async function resolveSpokenItem(
  prisma: PrismaClient,
  input: { name: string; brand?: string | null; size?: string | null; heard?: string | null; customerId?: string | null },
): Promise<ResolveResult> {
  const query = [input.brand, input.name].filter(Boolean).join(" ");
  const { norm, tokens } = normalizeUtterance(query);
  const brandNorm = input.brand ? normText(input.brand) : "";
  const sizeHint = extractSizeHint(`${input.name} ${input.size ?? ""}`);
  // Vagueness is judged on what was actually SAID (heard), not Sonnet's cleaned
  // name, so "olive oil" asks for brand/size even if the model guessed one.
  const vagueText = (input.heard && input.heard.trim()) || input.name;
  const vagueNorm = normalizeUtterance(vagueText);

  // 1. History (confident — a known reorder).
  if (input.customerId) {
    const h = await fromHistory(prisma, norm, input.customerId);
    if (h) return { match: h, alternatives: [], vague: false, ambiguous: false };
  }

  // 2. Tags (strong facet agreement).
  const t = await fromTags(prisma, tokens, brandNorm, sizeHint);
  if (t) return { match: t, alternatives: [], vague: false, ambiguous: false };

  // A bare type with no brand/size and no history → ask, don't fuzzy-guess a
  // specific brand. Offer the closest items for the picker (stage 3).
  const hits = await searchCatalog(prisma, query, 6);
  // Judge vagueness on the heard text alone — a brand the MODEL guessed (not one
  // the speaker said) shouldn't suppress the "which brand and size?" ask. A brand
  // the speaker actually said shows up as an extra heard token instead.
  if (await isVague(prisma, vagueNorm.norm, vagueNorm.tokens, "", extractSizeHint(vagueText))) {
    return { match: null, alternatives: hits.slice(0, 3), vague: true, ambiguous: hits.length > 0 };
  }

  // 3. Fuzzy name.
  if (hits.length) {
    const best = hits[0];
    const score = diceSim(norm, normText(`${best.brand ?? ""} ${best.name}`));
    // Don't let a fuzzy hit that rode on a shared type word substitute a DIFFERENT
    // brand the speaker named ("Schweppes …" → "Snaps …"): treat it as not-in-catalog.
    if (score >= FUZZY_MIN && !brandConflicts(brandNorm, best)) {
      // Ambiguous when the best isn't clearly best: low confidence, or a close runner-up.
      const second = hits[1] ? diceSim(norm, normText(`${hits[1].brand ?? ""} ${hits[1].name}`)) : 0;
      const ambiguous = score < CONFIDENT || score - second < 0.1;
      return { match: { ...best, source: "fuzzy", confidence: score, usualQty: null }, alternatives: hits.slice(1, 4), vague: false, ambiguous };
    }
    // Weak fuzzy or a cross-brand substitution → no confident match; offer the hits for the picker.
    return { match: null, alternatives: hits.slice(0, 3), vague: false, ambiguous: true };
  }

  // 4. Fallback — nothing close.
  return { match: null, alternatives: [], vague: false, ambiguous: false };
}

// Vague: a bare type word with no brand / size (e.g. "olive oil") → ask for
// brand + size rather than guess.
async function isVague(
  prisma: PrismaClient,
  norm: string,
  tokens: string[],
  brandNorm: string,
  sizeHint: ReturnType<typeof extractSizeHint>,
): Promise<boolean> {
  if (brandNorm || sizeHint || tokens.length > 2) return false;
  const types = await prisma.productTypeOption.findMany({ select: { name: true } });
  return types.some((ty) => {
    const tn = normText(ty.name);
    return tn === norm || norm.includes(tn) || tn.includes(norm);
  });
}
