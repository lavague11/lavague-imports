// Pulls halalco.com's grocery food + meat catalog (Shopify public product feed)
// into src/lib/catalog/catalog.halalco.json. Food/meat collections only — books,
// prayer items, clothing, and donations are excluded.
//
// Run: node scripts/import-halalco.mjs
import fs from "node:fs";
import path from "node:path";

const BASE = "https://halalco.com";
const OUT = "src/lib/catalog/catalog.halalco.json";

// Food + meat collection handles (from halalco's /collections.json). Everything
// non-food (Quran, books, prayer rugs, clothes, zikr beads, charity/zakat,
// games, institutional bundles) is deliberately left out.
const FOOD_COLLECTIONS = [
  // Meats
  "beef", "chicken", "goat", "baby-goat", "lamb", "veal",
  "soujouk", "soujouk-copy", "hot-dogs", "kabobs-rolls",
  // Dairy & eggs
  "cheese", "labne", "yogurt", "yogurt-drinks", "beverages", "milk",
  "milk-powder", "non-refrigerated-dairy",
  // Oils & ghee
  "olive-oil", "other-oils", "ghee",
  // Olives & pickles
  "olives", "pickles", "grape-leaves",
  // Spices & herbs
  "adonis-spices", "laziza-spices", "national-spices-mix", "regular-spices-mix",
  "shan-spices-mix", "herbs", "zaatar-and-sumac", "seasoning-broth", "salt",
  // Rice, grains, beans, flour, pasta
  "rice", "lentils", "beans", "beans-1", "canned-chickpeas", "canned-fava-beans",
  "bulgar-semolina", "flour", "all-purpose-flour", "gram-flour",
  "couscous", "pasta",
  // Canned & jarred
  "can-foods", "canned-foods", "canned-ready-to-eat", "canned-seafood",
  "canned-baba-ghanouj", "canned-mudammas", "pastes-sauces", "vinegar-molasses",
  // Bakery & bread
  "afghan-flatbread", "pita-bread", "other-breads", "fillo-doughs",
  "toasts-and-rusks",
  // Frozen
  "frozen", "breads", "frozen-desserts", "frozen-ready-to-eat", "vegetables",
  // Sweets & snacks
  "baking-desserts", "chocolates", "cookies", "desserts", "halva",
  "turkish-delight", "snacks",
  // Nuts, seeds & dates
  "nuts", "seeds", "dates",
  // Beverages
  "juices", "soda", "sparkling-water", "malt-drinks-non-alocholic", "coffee",
  "tea-coffee", "syrup", "zamzam",
  // Honey, jams, spreads
  "honey", "jams-spreads",
  // General grocery / produce
  "grocery", "fresh-produce",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polite, throttled fetch with backoff — halalco rate-limits bursts, so pace
// requests and retry on 429/5xx rather than giving up (which silently drops a
// whole collection).
async function fetchJson(url, attempt = 0) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (La Vague catalog import)" },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`${res.status} after retries ${url}`);
    await sleep(1500 * (attempt + 1));
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchCollectionProducts(handle) {
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${BASE}/collections/${handle}/products.json?limit=250&page=${page}`;
    const data = await fetchJson(url);
    if (!data.products || data.products.length === 0) break;
    out.push(...data.products);
    await sleep(350); // stay under Shopify's soft rate limit
    if (data.products.length < 250) break;
  }
  return out;
}

function cleanHtml(s) {
  return (s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "item"
  );
}

const run = async () => {
  const collectionTitles = {};
  try {
    const cj = await fetchJson(`${BASE}/collections.json?limit=250`);
    for (const c of cj.collections || []) collectionTitles[c.handle] = c.title;
  } catch {
    /* fall back to handle names */
  }

  // productId -> { product, collections:Set }
  const byId = new Map();
  let fetched = 0;
  for (const handle of FOOD_COLLECTIONS) {
    const products = await fetchCollectionProducts(handle);
    fetched += products.length;
    const title = collectionTitles[handle] || handle;
    for (const p of products) {
      const entry = byId.get(p.id) || { product: p, collections: new Set() };
      entry.collections.add(title);
      byId.set(p.id, entry);
    }
    process.stdout.write(`  ${handle}: ${products.length}\n`);
  }

  const usedSlugs = new Set();
  const usedSkus = new Set();
  const products = [];
  let imageHost = null;

  for (const { product: p, collections } of byId.values()) {
    if (p.published_at === null) continue;
    const variant = (p.variants || [])[0] || {};
    const priceNum = parseFloat(variant.price ?? "0");
    const priceCents = !isNaN(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null;
    const image = (p.images || [])[0]?.src || null;
    if (image && !imageHost) imageHost = new URL(image).host;

    let slug = slugify(p.title);
    let s = slug;
    let n = 2;
    while (usedSlugs.has(s)) s = `${slug}-${n++}`;
    slug = s;
    usedSlugs.add(slug);

    let sku = (variant.sku || "").trim() || `HAL-${slug}`.toUpperCase().slice(0, 40);
    let sk = sku;
    let k = 2;
    while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
    sku = sk;
    usedSkus.add(sku);

    products.push({
      source: "halalco",
      id: "hal_" + slug,
      slug,
      name: p.title.replace(/\s+/g, " ").trim(),
      tagline: null,
      description: cleanHtml(p.body_html).slice(0, 900) || `${p.title} — stocked by La Vague Imports.`,
      origin: null,
      brand: p.vendor && p.vendor !== "HalalcoStore" ? p.vendor : null,
      imageUrl: image,
      ribbon: null,
      isFeatured: false,
      collections: [...collections],
      productType: p.product_type || null,
      variants: [
        {
          id: "hal_var_" + slug,
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

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ products }, null, 2));

  const priced = products.filter((p) => p.variants[0].retailPriceCents != null).length;
  const withImg = products.filter((p) => p.imageUrl).length;
  console.log("\nWrote", OUT);
  console.log("  collection fetches:", fetched, "| unique products:", products.length);
  console.log("  priced:", priced, "| with image:", withImg, "| image host:", imageHost);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
