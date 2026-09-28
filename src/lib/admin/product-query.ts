import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * The single source of truth for the admin Products query — parsing URL params
 * into filters, building the Prisma `WHERE`/`ORDER BY`, and pagination sizes.
 * Both the Products page and the CSV export import this so an export always
 * matches exactly what's on screen.
 */

export const PAGE_SIZES = [50, 100, 250];
export const DEFAULT_PAGE_SIZE = 100;
export const MISSING = "__missing__";
export const CUSTOM = "__custom__";

const SORT_KEYS = ["name", "source", "category", "origin", "price", "status"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

type Raw = Record<string, string | string[] | undefined>;
const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const asList = (v: string | string[] | undefined) =>
  (firstValue(v) || "").split(",").map((s) => s.trim()).filter(Boolean);

export interface ProductParams {
  q: string;
  filter: string;
  sources: string[];
  cats: string[];
  origins: string[];
  statuses: string[];
  price: string;
  priceMin: number;
  priceMax: number;
  sortKey: SortKey | "";
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export function parseProductParams(params: Raw): ProductParams {
  const rawSort = firstValue(params.sort) ?? "";
  const sizeNum = Number(firstValue(params.pageSize));
  return {
    q: firstValue(params.q)?.trim() ?? "",
    filter: firstValue(params.filter) ?? "",
    sources: asList(params.source),
    cats: asList(params.category),
    origins: asList(params.origin),
    statuses: asList(params.status),
    price: firstValue(params.price) ?? "",
    priceMin: Number(firstValue(params.priceMin)),
    priceMax: Number(firstValue(params.priceMax)),
    sortKey: (SORT_KEYS as readonly string[]).includes(rawSort) ? (rawSort as SortKey) : "",
    dir: firstValue(params.dir) === "desc" ? "desc" : "asc",
    page: Math.max(1, Number(firstValue(params.page)) || 1),
    pageSize: PAGE_SIZES.includes(sizeNum) ? sizeNum : DEFAULT_PAGE_SIZE,
  };
}

/** The AND-list of filter conditions — everything except the `no-description`
 *  quick filter, which needs a raw query (see noDescriptionIds). */
export function buildWhereAnd(p: ProductParams): Prisma.ProductWhereInput[] {
  const and: Prisma.ProductWhereInput[] = [];
  if (p.q) and.push({ name: { contains: p.q, mode: "insensitive" } });

  if (p.sources.length) {
    const named = p.sources.filter((s) => s !== CUSTOM);
    const or: Prisma.ProductWhereInput[] = [];
    if (named.length) or.push({ source: { in: named } });
    if (p.sources.includes(CUSTOM)) or.push({ isCustom: true });
    and.push({ OR: or });
  }
  if (p.cats.length) and.push({ category: { slug: { in: p.cats } } });
  if (p.origins.length) {
    const named = p.origins.filter((o) => o !== MISSING);
    const or: Prisma.ProductWhereInput[] = [];
    if (named.length) or.push({ origin: { in: named } });
    if (p.origins.includes(MISSING)) or.push({ origin: null });
    and.push({ OR: or });
  }
  if (p.price === "has") and.push({ minPriceCents: { not: null } });
  else if (p.price === "request") and.push({ minPriceCents: null });
  else if (p.price === "range") {
    and.push({
      minPriceCents: {
        not: null,
        ...(p.priceMin ? { gte: Math.round(p.priceMin * 100) } : {}),
        ...(p.priceMax ? { lte: Math.round(p.priceMax * 100) } : {}),
      },
    });
  }
  const st = new Set(p.statuses);
  if (st.has("visible") && !st.has("hidden")) and.push({ isActive: true });
  else if (st.has("hidden") && !st.has("visible")) and.push({ isActive: false });
  if (st.has("retail")) and.push({ retailEnabled: true });
  if (st.has("wholesale")) and.push({ wholesaleEnabled: true });

  if (p.filter === "missing-image") and.push({ imageUrl: null });
  if (p.filter === "hidden") and.push({ isActive: false });
  if (p.filter === "custom") and.push({ isCustom: true });
  return and;
}

export function buildOrderBy(
  sortKey: SortKey | "",
  dir: "asc" | "desc",
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sortKey) {
    case "name": return [{ name: dir }];
    case "source": return [{ source: dir }, { name: "asc" }];
    case "category": return [{ category: { name: dir } }, { name: "asc" }];
    case "origin": return [{ origin: { sort: dir, nulls: "last" } }, { name: "asc" }];
    case "price": return [{ minPriceCents: { sort: dir, nulls: "last" } }, { name: "asc" }];
    case "status": return [{ isActive: dir }, { name: "asc" }];
    default: return [{ isActive: "desc" }, { name: "asc" }];
  }
}

/** Ids of products whose description is empty / a bare pack code / too short.
 *  Prisma can't do length/regex, so this is a raw query. */
export async function noDescriptionIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Product"
     WHERE btrim(description) = ''
        OR length(btrim(description)) < 45
        OR btrim(description) ~* '^[0-9]+([.,][0-9]+)?[[:space:]]*[a-z]{0,10}[[:space:]]*[x×*][[:space:]]*[0-9]+$'`,
  );
  return rows.map((r) => r.id);
}

/** The full WHERE for a parsed param set, including the no-description filter. */
export async function buildProductWhere(
  prisma: PrismaClient,
  p: ProductParams,
): Promise<Prisma.ProductWhereInput> {
  const and = buildWhereAnd(p);
  if (p.filter === "no-description") and.push({ id: { in: await noDescriptionIds(prisma) } });
  return and.length ? { AND: and } : {};
}
