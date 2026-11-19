import "server-only";

import { requirePrisma } from "@/lib/db";
import type { TagKind } from "@/generated/prisma/client";

// Product tags (PRODUCT_TAGS §1): structured facets + spoken names, keyed by
// product slug so they survive a re-import. This module owns normalization,
// size parsing, and the write rules (one BRAND/TYPE/SIZE/VARIANT; 8 total max).

export const MAX_TAGS = 8;
export const TAG_KINDS: TagKind[] = ["BRAND", "TYPE", "SIZE", "VARIANT", "SPOKEN"];
export const STRUCTURED_KINDS: TagKind[] = ["BRAND", "TYPE", "SIZE", "VARIANT"];

export interface TagRow {
  id: string;
  kind: TagKind;
  value: string;
  norm: string;
  lang: string | null;
  sizeAmount: number | null;
  sizeUnit: string | null;
  source: string;
}

/** Normalize text for matching: lowercase, Arabic letter/diacritic folding,
 *  punctuation stripped, whitespace collapsed. Shared with voice matching. */
export function normText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "") // Arabic diacritics (harakat)
    .replace(/[آأإٱ]/g, "ا") // أ إ آ ٱ → ا
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ى/g, "ي") // ى → ي
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Size unit → base unit + multiplier. Base units: ml (volume), g (weight), piece.
const SIZE_UNITS: Record<string, { unit: "ml" | "g" | "piece"; mult: number }> = {
  l: { unit: "ml", mult: 1000 }, liter: { unit: "ml", mult: 1000 }, litre: { unit: "ml", mult: 1000 }, lt: { unit: "ml", mult: 1000 },
  ml: { unit: "ml", mult: 1 }, cl: { unit: "ml", mult: 10 },
  kg: { unit: "g", mult: 1000 }, kilo: { unit: "g", mult: 1000 }, kilos: { unit: "g", mult: 1000 },
  g: { unit: "g", mult: 1 }, gr: { unit: "g", mult: 1 }, gram: { unit: "g", mult: 1 }, grams: { unit: "g", mult: 1 },
  oz: { unit: "g", mult: 28.3495 }, lb: { unit: "g", mult: 453.592 }, lbs: { unit: "g", mult: 453.592 },
  "floz": { unit: "ml", mult: 29.5735 },
  pc: { unit: "piece", mult: 1 }, pcs: { unit: "piece", mult: 1 }, piece: { unit: "piece", mult: 1 }, pieces: { unit: "piece", mult: 1 },
  ct: { unit: "piece", mult: 1 }, count: { unit: "piece", mult: 1 }, each: { unit: "piece", mult: 1 },
};

/** Parse a size like "1 L", "70g", "33 cl", "16 oz", "12 ct" → base-unit magnitude. */
export function parseSize(value: string): { amount: number; unit: "ml" | "g" | "piece" } | null {
  const m = value.toLowerCase().replace(/fl\s*oz/g, "floz").match(/(\d+(?:[.,]\d+)?)\s*([a-z]+)?/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const key = (m[2] || "").replace(/\.$/, "");
  const u = SIZE_UNITS[key] ?? (key ? null : SIZE_UNITS.piece);
  if (!u) return null;
  return { amount: amount * u.mult, unit: u.unit };
}

interface NormTag { norm: string; sizeAmount: number | null; sizeUnit: string | null }
function normalizeForKind(kind: TagKind, value: string): NormTag {
  if (kind === "SIZE") {
    const s = parseSize(value);
    return { norm: s ? `${s.amount}${s.unit}` : normText(value), sizeAmount: s?.amount ?? null, sizeUnit: s?.unit ?? null };
  }
  return { norm: normText(value), sizeAmount: null, sizeUnit: null };
}

export async function getProductTags(slug: string): Promise<TagRow[]> {
  const prisma = requirePrisma();
  const rows = await prisma.productTag.findMany({
    where: { slug },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, value: true, norm: true, lang: true, sizeAmount: true, sizeUnit: true, source: true },
  });
  return rows as TagRow[];
}

export type AddTagResult = { ok: true } | { ok: false; error: "cap" | "empty" };

/** Add a tag. Structured kinds replace any existing tag of that kind; SPOKEN
 *  appends (deduped on norm). Enforces the 8-tag cap. */
export async function addProductTag(
  slug: string,
  kind: TagKind,
  value: string,
  opts: { lang?: string | null; source?: string } = {},
): Promise<AddTagResult> {
  const prisma = requirePrisma();
  const v = value.trim();
  if (!v) return { ok: false, error: "empty" };
  const { norm, sizeAmount, sizeUnit } = normalizeForKind(kind, v);

  const existing = await prisma.productTag.findMany({ where: { slug }, select: { id: true, kind: true, norm: true } });
  const isStructured = STRUCTURED_KINDS.includes(kind);
  const replacingId = isStructured ? existing.find((t) => t.kind === kind)?.id : existing.find((t) => t.kind === kind && t.norm === norm)?.id;

  // Cap: count stays the same when replacing, otherwise +1.
  if (!replacingId && existing.length >= MAX_TAGS) return { ok: false, error: "cap" };

  if (replacingId) await prisma.productTag.delete({ where: { id: replacingId } });
  await prisma.productTag.create({
    data: { slug, kind, value: v, norm, lang: opts.lang ?? null, sizeAmount, sizeUnit, source: opts.source ?? "manual" },
  });
  return { ok: true };
}

export async function removeProductTag(id: string): Promise<void> {
  await requirePrisma().productTag.delete({ where: { id } }).catch(() => {});
}

// --- Controlled TYPE list ---------------------------------------------------

export async function listTypeOptions(): Promise<{ id: string; name: string }[]> {
  return requirePrisma().productTypeOption.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

export async function addTypeOption(name: string): Promise<void> {
  const prisma = requirePrisma();
  const n = name.trim();
  if (!n) return;
  const max = await prisma.productTypeOption.aggregate({ _max: { position: true } });
  await prisma.productTypeOption.upsert({
    where: { name: n },
    update: {},
    create: { name: n, position: (max._max.position ?? 0) + 1 },
  });
}

export async function removeTypeOption(id: string): Promise<void> {
  await requirePrisma().productTypeOption.delete({ where: { id } }).catch(() => {});
}
