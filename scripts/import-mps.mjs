// Pulls moroccanpantryshop.com (a sister store, WooCommerce Store API) into
// src/lib/catalog/catalog.mps.json, then build-catalog.mjs merges it in.
//
// It DEDUPES against the already-merged catalog.json: any MPS item that is the
// same *retail* offering we already carry (fuzzy name match, same pack class) is
// skipped, so the storefront never shows a duplicate. Bulk sacks/pails and
// food-service multipacks ARE kept as distinct wholesale SKUs even when a retail
// version exists — MPS is largely a wholesale catalog. Category pages, freight,
// and gift cards are dropped.
//
// Run: node scripts/import-mps.mjs   (then node scripts/build-catalog.mjs)
import fs from "node:fs";

const BASE = "https://moroccanpantryshop.com/wp-json/wc/store/v1/products";
const OUT = "src/lib/catalog/catalog.mps.json";
const CATALOG = "src/lib/catalog/catalog.json";
const NOURA = "scripts/noura-add-list.json";

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
    .replace(/&#0?39;|&rsquo;|&apos;|&#8217;/g, "'")
    .replace(/&amp;|&#0?38;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/&#215;|&#0?215;/g, "x").replace(/&ndash;|&#8211;|&mdash;|&#8212;/g, "-")
    .replace(/&#8220;|&#8221;/g, '"').replace(/&hellip;/g, "…").replace(/&#8482;|&reg;/g, "");
}
function cleanHtml(s) {
  return decode(
    (s || "")
      .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
      .replace(/<li>/gi, "• ").replace(/<[^>]+>/g, ""),
  ).replace(/[ \t]+/g, " ").split("\n").map((l) => l.trim()).filter(Boolean).join(" ").trim();
}
function slugify(s) {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "item"
  );
}
// Title-case SHOUTING names while preserving unit casing (5 LB -> 5 lb, 1L, cl).
function tidyName(name) {
  const letters = name.replace(/[^a-z]/gi, "");
  const upperRatio = letters ? (name.replace(/[^A-Z]/g, "").length / letters.length) : 0;
  let out = name;
  if (upperRatio > 0.7 && letters.length > 3) {
    out = name.toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
  }
  return out
    .replace(/(\d)\s*(lbs?|kg|oz|gr?|ml|cl|fl)\b/gi, (m, d, u) => `${d}${u.toLowerCase()}`)
    .replace(/(\d)\s*l\b/g, "$1L").replace(/\bLbs?\b/g, (m) => m.toLowerCase())
    .replace(/\s+/g, " ").trim();
}

// ---- dedup helpers (mirror the review analysis) ----
const isBulk = (s) => {
  const t = s.toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg)\b/);
  if (m && parseFloat(m[1].replace(",", ".")) >= 5) return true;
  if (/\d+\s*\*\s*\d+\s*(kg|lbs?)\b/.test(t)) return true;
  if (/\bpail|pails|\bopc\b|food ?service|\bsack\b|\bbulk\b/.test(t)) return true;
  return false;
};
const isFoodservice = (s) => /\b\d+\s*(cl|l)\s*\*\s*\d+\b|\b\d+\s*\*\s*\d+\s*(l|cl)\b/i.test(s);
const SIZE = /\b\d+([.,]\d+)?\s*(x|\*)?\s*(l|cl|ml|kg|g|gr|oz|lb|lbs|ct|pcs?|pieces?|pack|liters?|litres?|gallons?|fl)\b|\b(x|\*)\s*\d+\b|\bpack of \d+\b|\b\d+\s*(x|\*)\s*\d+\b|\b\d+([.,]\d+)?\b/gi;
const STOP = new Set(["the", "a", "of", "by", "and", "in", "with", "from", "style", "moroccan", "morocco", "case", "pcs", "pc"]);
const norm = (s) => decode(s).toLowerCase().replace(SIZE, " ").replace(/[^a-z]+/g, " ")
  .split(/\s+/).filter((w) => w && !STOP.has(w) && w.length > 1);
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const t of a) if (b.has(t)) i++; return Math.max(i / (a.size + b.size - i), (i / Math.min(a.size, b.size)) * 0.9); };

// category (unified) -> a collection string build-catalog maps deterministically
const CAT_RULES = [
  [/olive oil|extra virgin|\bevo\b|argan oil|sunflower oil|corn oil|vegetable oil|canola|\bghee\b|edible oil|portofina|yudum/i, "Oil"],
  [/honey|molasses|\bjam\b|marmalade|date paste|spread|tahini|tahina/i, "Honey"],
  [/sardine|tuna|anchov|mackerel|\bfish\b|seafood|shrimp|calamari|pecheur/i, "Canned Seafood"],
  [/preserved lemon|\bolives?\b|caper|torshi|makdous|kalamata|picholine|gaeta|infornate|mediterranean mix|greenworld|pickle|mekhalel|pitted (green|black|kalam)|(green|black|whole) olive|\bcracked\b/i, "Olives & Pickles"],
  [/coffee|cappuccino|nescafe|latte|\btea\b|green tea|gunpowder|\bchai\b|matcha|maghribya tea|\batlas\b|\bsoda\b|\bcola\b|\bjuice\b|nectar|\bdrink|sparkling|\bsyrup\b|hawaii|poms|tropical|dry lemon/i, "Drinks"],
  [/noodle|vermicelli|macaroni|\bpasta\b|couscous|spaghetti|angel hair|bird tongue|petit plomb|langue|shariya/i, "Pasta"],
  [/kunafa|baklava|samousa|samosa|filo|phyllo|malsouka|warka|\bbrick\b|pastry|qatayef|crepe|\bkahk\b/i, "Fillo & Doughs"],
  [/harissa|tomato paste|tomato sauce|\bsauce\b|\bpuree\b|\bfoul\b|fava|hummus|canned food|jarred|\bsoup\b|harira|bissara|falafel/i, "Canned Foods"],
  [/spice|pepper|cumin|coriander|turmeric|tumeric|paprika|oregano|basil|thyme|za.?atar|sumac|cinnamon|clove|cardamom|cardamon|ginger|fennel|fenugreek|anis|anise|caraway|saffron|masala|seasoning|\bherb|celery seed|tarragon|taragon|chives|chamomille|chamomile|rosemary|nutmeg|methi|nigella|black seed|sesame|adobo|cajun|mansaf|kafta|shish|iraqi|iraqui|pickling|steak|onion (powder|chopped|granulated)|garlic|\bsalt\b|isot|alepo|aleppo|semolina blend|\bcurry\b|\bsage\b|\bchill?i\b|parsley|mustard|\bbay\b|\bdill\b|marjoram|savory|allspice|poppy|\bmint\b/i, "Herbs & Spices"],
  [/biscuit|petit four|cookie|wafer|\bcake\b|\bcone\b|\brusk\b|\btoast\b|cracker|croissant|bimo|merendina|tonik|tagger|\bsnack|chocolate|candy|halva|halawa|turkish delight|nougat|\bsweet\b|dessert|sprinkles/i, "Snacks"],
  [/almond|walnut|pistachio|cashew|\bdates?\b|deglet|raisin|prune|apricot|\bfigs?\b|dried fruit|sundried|\bseeds?\b|\bnuts?\b|hazelnut|filbert|coconut/i, "Nuts"],
  [/milk|cheese|yogurt|labne|labneh|butter|dairy/i, "Cheese"],
  [/\bflour\b|baking powder|\byeast\b|starch|citric acid/i, "Flour"],
  [/rice\b|bulgur|bulgar|freekeh|lentil|\bbeans?\b|chickpea|\bwheat\b|\bgrain|semolina/i, "Rice"],
  [/tea ?pot|teapot|tea glass|teacup|tea cup|\bpot\b|cooker|steamer|\bpan\b|utensil|\btray\b|\bmold\b|tagine|tajine|tanjya|tanjia|couscoussier|clay|pitcher|water cup|\bglass|shelf|\brack|gloves|chabak|naksh|guessaa|houseware|tumbler|inox|silver tray|water clay/i, "Kitchen items"],
  [/soap|detergent|laundry|cleaner|shampoo|body care|charcoal/i, "Body Care"],
  [/chicken|\bbeef\b|\blamb\b|\bgoat\b|\bmeat\b|poultry|sausage|saucage|mortadella|luncheon/i, "Meat"],
];
const collectionFor = (name) => (CAT_RULES.find(([re]) => re.test(name)) ?? [null, null])[1];

const CATEGORY_NAMES = /^(houseware|edible oils|canned seafood|mog olives|olives food ?service|dry fruits and nuts|extra virgin oil|al maghribya tea|beverage|spices|olives|couscous.*pasta)$/i;
const NONPRODUCT = /freight|shipping|gift ?card|inland/i;

const run = async () => {
  // 1. existing catalog (already-merged) + Noura DB list = what we already carry.
  //    Skip any prior MPS-sourced rows so a rebuilt catalog.json doesn't cause the
  //    importer to dedupe MPS against itself (keeps re-runs idempotent).
  const cat = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const existing = cat.products
    .filter((p) => p.source !== "mps" && !(p.id || "").startsWith("mps_"))
    .map((p) => ({ toks: new Set(norm(p.name)), bulk: isBulk(p.name) }));
  if (fs.existsSync(NOURA)) {
    for (const n of JSON.parse(fs.readFileSync(NOURA, "utf8"))) existing.push({ toks: new Set(norm(n.name)), bulk: isBulk(n.name) });
  }

  // 2. pull MPS
  const all = [];
  for (let page = 1; page <= 100; page += 1) {
    const data = await fetchJson(`${BASE}?per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    await sleep(250);
    if (data.length < 100) break;
  }

  const usedSlugs = new Set();
  const usedSkus = new Set();
  const products = [];
  let skipped = 0, excluded = 0;

  for (const p of all) {
    if (p.type === "grouped") { excluded++; continue; }
    const rawName = decode(p.name || "").replace(/\s+/g, " ").trim();
    if (!rawName || CATEGORY_NAMES.test(rawName) || NONPRODUCT.test(rawName)) { excluded++; continue; }

    const bulk = isBulk(rawName), fs2 = isFoodservice(rawName);
    const toks = new Set(norm(rawName));
    let best = 0, bestBulk = false;
    for (const e of existing) { const s = overlap(toks, e.toks); if (s > best) { best = s; bestBulk = e.bulk; } }
    // Skip only same-format retail duplicates we already carry.
    if (!bulk && !fs2 && best >= 0.8 && !bestBulk) { skipped++; continue; }

    const name = tidyName(rawName);
    const minorUnit = p.prices?.currency_minor_unit ?? 2;
    const rawPrice = parseInt(p.prices?.price ?? "0", 10);
    const priceCents = rawPrice > 0 ? (minorUnit === 2 ? rawPrice : Math.round((rawPrice / 10 ** minorUnit) * 100)) : null;

    let slug = slugify(name);
    let s = slug, n = 2;
    while (usedSlugs.has(s)) s = `${slug}-${n++}`;
    slug = s; usedSlugs.add(slug);

    let sku = (p.sku || "").trim() && !/^wc-\d+$/i.test(p.sku) ? p.sku.trim() : `MPS-${slug}`.toUpperCase().slice(0, 40);
    let sk = sku, k = 2;
    while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
    sku = sk; usedSkus.add(sku);

    const col = collectionFor(name);
    products.push({
      source: "mps",
      id: "mps_" + slug,
      slug,
      name,
      tagline: null,
      description: cleanHtml(p.short_description) || cleanHtml(p.description) || `${name} — imported by La Vague Imports.`,
      origin: null,
      brand: null,
      imageUrl: (p.images || [])[0]?.src || null,
      ribbon: bulk ? "Wholesale" : null,
      isFeatured: false,
      collections: col ? [col] : [],
      variants: [
        {
          id: "mps_var_" + slug,
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
  console.log(`  pulled ${all.length} | added ${products.length} | skipped ${skipped} dups | excluded ${excluded} non-products`);
  console.log(`  priced ${priced} | with image ${withImg}`);
};

run().catch((e) => { console.error(e); process.exit(1); });
