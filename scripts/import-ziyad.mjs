// Pulls ziyad.com's product catalog (WooCommerce Store API) into
// src/lib/catalog/catalog.ziyad.json. Ziyad is a brand catalog, so most items
// are unpriced ("price on request").
//
// Run: node scripts/import-ziyad.mjs
import fs from "node:fs";

const BASE = "https://www.ziyad.com/wp-json/wc/store/v1/products";
const OUT = "src/lib/catalog/catalog.ziyad.json";
const IMAGE_HOST = "www.ziyad.com";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (La Vague catalog import)" } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`${res.status} after retries ${url}`);
    await sleep(1500 * (attempt + 1));
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function decode(s) {
  return (s || "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&apos;|&#8217;/g, "'").replace(/&hellip;/g, "…")
    .replace(/&ndash;|&#8211;/g, "–").replace(/&mdash;|&#8212;/g, "—");
}
function cleanHtml(s) {
  return decode(
    (s || "")
      .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
      .replace(/<li>/gi, "• ").replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ").split("\n").map((l) => l.trim()).filter(Boolean).join(" ").trim();
}
function slugify(s) {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "item"
  );
}

const run = async () => {
  const all = [];
  for (let page = 1; page <= 100; page += 1) {
    const data = await fetchJson(`${BASE}?per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    await sleep(300);
    if (data.length < 100) break;
  }

  const usedSlugs = new Set();
  const usedSkus = new Set();
  const products = [];
  const catCounts = {};

  for (const p of all) {
    if (p.type === "variation") continue;
    const name = decode(p.name || "").replace(/\s+/g, " ").trim();
    if (!name) continue;

    const minorUnit = p.prices?.currency_minor_unit ?? 2;
    const rawPrice = parseInt(p.prices?.price ?? "0", 10);
    // Store API prices are already in minor units (cents for USD).
    const priceCents = rawPrice > 0 ? (minorUnit === 2 ? rawPrice : Math.round((rawPrice / 10 ** minorUnit) * 100)) : null;

    const cats = (p.categories || []).map((c) => decode(c.name)).filter(Boolean);
    cats.forEach((c) => (catCounts[c] = (catCounts[c] || 0) + 1));
    const brand = (p.brands || [])[0]?.name ? decode(p.brands[0].name) : "Ziyad";

    let slug = slugify(name);
    let s = slug, n = 2;
    while (usedSlugs.has(s)) s = `${slug}-${n++}`;
    slug = s; usedSlugs.add(slug);

    let sku = (p.sku || "").trim() || `ZIY-${slug}`.toUpperCase().slice(0, 40);
    let sk = sku, k = 2;
    while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
    sku = sk; usedSkus.add(sku);

    products.push({
      source: "ziyad",
      id: "ziy_" + slug,
      slug,
      name,
      tagline: null,
      description: cleanHtml(p.short_description || p.description) || `${name} — imported by La Vague Imports.`,
      origin: null,
      brand,
      imageUrl: (p.images || [])[0]?.src || null,
      ribbon: null,
      isFeatured: false,
      collections: cats,
      variants: [
        {
          id: "ziy_var_" + slug,
          sku,
          name: "Each",
          retailPriceCents: priceCents,
          compareAtPriceCents: null,
          unitsPerCase: null,
          minOrderCases: null,
          inStock: p.is_in_stock !== false,
        },
      ],
    });
  }

  fs.writeFileSync(OUT, JSON.stringify({ products }, null, 2));
  const priced = products.filter((p) => p.variants[0].retailPriceCents != null).length;
  const withImg = products.filter((p) => p.imageUrl).length;
  console.log("Wrote", OUT);
  console.log("  products:", products.length, "| priced:", priced, "| with image:", withImg, "| image host:", IMAGE_HOST);
  console.log("  Ziyad categories:");
  Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log("   ", String(v).padStart(3), k));
};

run().catch((e) => { console.error(e); process.exit(1); });
