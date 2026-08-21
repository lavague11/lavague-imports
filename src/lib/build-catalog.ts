import { buildCatalogPdf, type PdfProduct, type PdfSection } from "@/lib/catalog-pdf";
import { countryFilters } from "@/lib/catalog/data";
import { isoFor } from "@/lib/countries";
import type { getPrisma } from "@/lib/db";
import { site } from "@/lib/site";
import { getThumb } from "@/lib/thumbs";

type Prisma = NonNullable<ReturnType<typeof getPrisma>>;
export type SortMode = "country" | "category";

/** Run async tasks with a small concurrency cap. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export interface CatalogOptions {
  countrySlugs?: string[];
  categorySlugs?: string[];
  sortMode: SortMode;
  max: number;
}

/** Generates a catalog PDF for the given filters. Null if nothing matched. */
export async function generateCatalog(
  prisma: Prisma,
  opts: CatalogOptions,
): Promise<{ pdf: Uint8Array; count: number } | null> {
  const countrySlugs = opts.countrySlugs ?? [];
  const categorySlugs = opts.categorySlugs ?? [];
  const { sortMode, max } = opts;

  const [allCategories, originRows] = await Promise.all([
    prisma.category.findMany({ orderBy: { position: "asc" }, select: { slug: true, name: true } }),
    prisma.product.groupBy({
      by: ["origin"],
      where: { isActive: true, origin: { not: null } },
      _count: { _all: true },
    }),
  ]);
  // Country list derived from the live catalog so custom-product origins (e.g.
  // Italy) get a section; seed countries keep their curated order, extras trail.
  const seedOrder = new Map(countryFilters.map((c, i) => [c.name, i] as const));
  const seedSlug = new Map(countryFilters.map((c) => [c.name, c.slug] as const));
  const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const allCountries = originRows
    .map((r) => ({ name: r.origin as string, slug: seedSlug.get(r.origin as string) ?? toSlug(r.origin as string), count: r._count._all }))
    .sort((a, b) => (seedOrder.get(a.name) ?? 999) - (seedOrder.get(b.name) ?? 999) || b.count - a.count);
  const countryNames = countrySlugs
    .map((slug) => allCountries.find((c) => c.slug === slug)?.name)
    .filter((n): n is string => Boolean(n));

  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(categorySlugs.length ? { category: { slug: { in: categorySlugs } } } : {}),
      ...(countryNames.length ? { origin: { in: countryNames } } : {}),
    },
    include: { category: true, variants: { orderBy: { position: "asc" }, take: 1 } },
    orderBy: [{ category: { position: "asc" } }, { name: "asc" }],
    take: max,
  });
  if (rows.length === 0) return null;

  const images = await pool(rows, 12, (p) => getThumb(p.imageUrl, prisma));

  const items = rows.map((p, idx) => {
    const v = p.variants[0];
    const size = v?.name && !/^each$/i.test(v.name) ? v.name : "";
    const secondary = sortMode === "country" ? p.category.name : p.origin;
    return {
      origin: p.origin,
      categorySlug: p.category.slug,
      categoryName: p.category.name,
      prod: {
        name: p.name,
        sku: v?.sku ?? "",
        size,
        meta: [size, secondary].filter(Boolean).join("  ·  "),
        origin: p.origin,
        image: images[idx],
      } as PdfProduct,
    };
  });

  const catName = new Map(allCategories.map((c) => [c.slug, c.name]));
  const catOrder = allCategories.map((c) => c.slug);
  // Big single-brand variation lines get a compact list instead of image cards.
  const isMarrakesh = (name: string) => /^marrakesh\b/i.test(name);
  const mkLabel = (n: number) => `Marrakesh Spices (${n} varieties)`;

  let sections: PdfSection[];
  if (sortMode === "country") {
    // country → category → products, with Marrakesh spices as a compact list.
    const byCountry = new Map<string, { cats: Map<string, PdfProduct[]>; mk: PdfProduct[] }>();
    for (const it of items) {
      const ck = it.origin || "__none";
      let g = byCountry.get(ck);
      if (!g) byCountry.set(ck, (g = { cats: new Map(), mk: [] }));
      if (isMarrakesh(it.prod.name)) g.mk.push(it.prod);
      else (g.cats.get(it.categorySlug) ?? g.cats.set(it.categorySlug, []).get(it.categorySlug)!).push(it.prod);
    }
    const subs = (g: { cats: Map<string, PdfProduct[]>; mk: PdfProduct[] }) => {
      const out: PdfSection["subgroups"] = [];
      for (const s of catOrder) {
        if (g.cats.has(s)) out.push({ label: catName.get(s) ?? s, products: g.cats.get(s)! });
        if (s === "spices-herbs" && g.mk.length) out.push({ label: mkLabel(g.mk.length), products: g.mk, list: true });
      }
      return out;
    };
    sections = allCountries.filter((c) => byCountry.has(c.name)).map((c) => ({ name: c.name, subgroups: subs(byCountry.get(c.name)!) }));
    if (byCountry.has("__none")) sections.push({ name: "Other origins", subgroups: subs(byCountry.get("__none")!) });
  } else {
    // category → products; Marrakesh spices become a compact list in Spices.
    const groups = new Map<string, PdfProduct[]>();
    for (const it of items) {
      (groups.get(it.categorySlug) ?? groups.set(it.categorySlug, []).get(it.categorySlug)!).push(it.prod);
    }
    sections = allCategories
      .filter((c) => groups.has(c.slug))
      .map((c) => {
        const prods = groups.get(c.slug)!;
        if (c.slug !== "spices-herbs") return { name: c.name, subgroups: [{ label: "", products: prods }] };
        const mk = prods.filter((p) => isMarrakesh(p.name));
        const rest = prods.filter((p) => !isMarrakesh(p.name));
        const sg: PdfSection["subgroups"] = [];
        if (rest.length) sg.push({ label: "", products: rest });
        if (mk.length) sg.push({ label: mkLabel(mk.length), products: mk, list: true });
        return { name: c.name, subgroups: sg };
      });
  }

  const flags: Record<string, { bytes: Uint8Array; type: "png" | "jpg" }> = {};
  const origins = [...new Set(items.map((i) => i.origin).filter((o): o is string => Boolean(o)))];
  await Promise.all(
    origins.map(async (name) => {
      const iso = isoFor(name);
      if (!iso) return;
      try {
        const res = await fetch(`https://flagcdn.com/w40/${iso}.png`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return;
        const b = new Uint8Array(await res.arrayBuffer());
        if (b[0] === 0x89 && b[1] === 0x50) flags[name] = { bytes: b, type: "png" };
      } catch {
        /* skip */
      }
    }),
  );

  const scope = [
    countryNames.length ? countryNames.join(", ") : "All countries",
    categorySlugs.length ? categorySlugs.map((s) => allCategories.find((c) => c.slug === s)?.name ?? s).join(", ") : "All categories",
    sortMode === "country" ? "by country" : "by category",
  ].join("  ·  ");

  const pdf = await buildCatalogPdf({
    scopeLabel: rows.length >= max ? `${scope}  (first ${max})` : scope,
    dateLabel: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" }),
    shopUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://lavagueimports.com") + "/shop",
    phone: site.phone,
    email: site.email,
    sections,
    flags,
  });

  return { pdf, count: rows.length };
}
