// Pulls Moroccan Olive Grove (moroccanolivegrove.com, Shopify) into
// catalog.mog.json. Small boutique — olive oil, olives, condiments.
//
// Run: node scripts/import-mog.mjs
import fs from "node:fs";

const BASE = "https://www.moroccanolivegrove.com";
const OUT = "src/lib/catalog/catalog.mog.json";
const UA = { "User-Agent": "Mozilla/5.0 (La Vague catalog import)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Skip non-grocery product types.
const SKIP_TYPES = /gift card|gift-card/i;

async function fetchJson(url, attempt = 0) {
  const res = await fetch(url, { headers: UA });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`${res.status} ${url}`);
    await sleep(1500 * (attempt + 1));
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
function cleanHtml(s) {
  return (s || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h[1-6])>/gi, "\n").replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&apos;/g, "'").replace(/[ \t]+/g, " ")
    .split("\n").map((l) => l.trim()).filter(Boolean).join(" ").trim();
}
function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "item";
}

const run = async () => {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await fetchJson(`${BASE}/products.json?limit=250&page=${page}`);
    if (!data.products || data.products.length === 0) break;
    all.push(...data.products);
    await sleep(300);
    if (data.products.length < 250) break;
  }

  const usedSlugs = new Set();
  const usedSkus = new Set();
  const products = [];

  for (const p of all) {
    if (SKIP_TYPES.test(p.product_type || "") || SKIP_TYPES.test(p.title || "")) continue;
    const variant = (p.variants || [])[0] || {};
    const priceNum = parseFloat(variant.price ?? "0");
    const priceCents = priceNum > 0 ? Math.round(priceNum * 100) : null;

    let slug = slugify(p.title);
    let s = slug, n = 2;
    while (usedSlugs.has(s)) s = `${slug}-${n++}`;
    slug = s; usedSlugs.add(slug);

    let sku = (variant.sku || "").trim() || `MOG-${slug}`.toUpperCase().slice(0, 40);
    let sk = sku, k = 2;
    while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
    sku = sk; usedSkus.add(sku);

    products.push({
      source: "mog",
      id: "mog_" + slug,
      slug,
      name: (p.title || "").replace(/\s+/g, " ").trim(),
      tagline: null,
      description: cleanHtml(p.body_html).slice(0, 900) || `${p.title} — imported by La Vague Imports.`,
      origin: "Morocco",
      brand: p.vendor || "Moroccan Olive Grove",
      imageUrl: (p.images || [])[0]?.src || null,
      ribbon: null,
      isFeatured: false,
      collections: [p.product_type || "Olive Oil", ...(p.tags || [])].filter(Boolean),
      variants: [
        {
          id: "mog_var_" + slug,
          sku,
          name: (p.variants || []).length > 1 ? "Options" : "Each",
          retailPriceCents: priceCents,
          compareAtPriceCents: null,
          unitsPerCase: null,
          minOrderCases: null,
          inStock: (p.variants || []).some((v) => v.available !== false),
        },
      ],
    });
  }

  fs.writeFileSync(OUT, JSON.stringify({ products }, null, 2));
  console.log("Wrote", OUT);
  console.log("  products:", products.length, "| priced:", products.filter((p) => p.variants[0].retailPriceCents != null).length);
  products.slice(0, 8).forEach((p) => console.log("   -", p.name, "| $" + (p.variants[0].retailPriceCents / 100 || "—")));
};

run().catch((e) => { console.error(e); process.exit(1); });
