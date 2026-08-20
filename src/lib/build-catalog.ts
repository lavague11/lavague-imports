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

  const [allCategories, allCountries] = await Promise.all([
    prisma.category.findMany({ orderBy: { position: "asc" }, select: { slug: true, name: true } }),
    Promise.resolve(countryFilters),
  ]);
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

  let sections: PdfSection[];
  if (sortMode === "country") {
    // country → category → products (category sub-dividers inside each country)
    const byCountry = new Map<string, Map<string, PdfProduct[]>>();
    for (const it of items) {
      const ck = it.origin || "__none";
      let cats = byCountry.get(ck);
      if (!cats) byCountry.set(ck, (cats = new Map()));
      (cats.get(it.categorySlug) ?? cats.set(it.categorySlug, []).get(it.categorySlug)!).push(it.prod);
    }
    const subs = (cats: Map<string, PdfProduct[]>) =>
      catOrder.filter((s) => cats.has(s)).map((s) => ({ label: catName.get(s) ?? s, products: cats.get(s)! }));
    sections = allCountries.filter((c) => byCountry.has(c.name)).map((c) => ({ name: c.name, subgroups: subs(byCountry.get(c.name)!) }));
    if (byCountry.has("__none")) sections.push({ name: "Other origins", subgroups: subs(byCountry.get("__none")!) });
  } else {
    // category → products (no sub-dividers)
    const groups = new Map<string, PdfProduct[]>();
    for (const it of items) {
      (groups.get(it.categorySlug) ?? groups.set(it.categorySlug, []).get(it.categorySlug)!).push(it.prod);
    }
    sections = allCategories
      .filter((c) => groups.has(c.slug))
      .map((c) => ({ name: c.name, subgroups: [{ label: "", products: groups.get(c.slug)! }] }));
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
