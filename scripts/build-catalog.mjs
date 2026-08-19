// Merges the La Vague (Wix) and halalco (Shopify) source catalogs into the
// single catalog.json the app + seed read. Dedupes by name, re-categorizes
// everything into one unified grocery category set, and rebuilds the shop's
// collection filters.
//
// Run: node scripts/build-catalog.mjs   (after the two source importers)
import fs from "node:fs";

const DIR = "src/lib/catalog";
const OUT = `${DIR}/catalog.json`;
// Sources in merge priority: priced/imaged sources first so they win name
// collisions. Each is optional — a missing file is simply skipped.
const SOURCES = [
  "catalog.halalco.json",
  "catalog.fattals.json",
  "catalog.mog.json",
  "catalog.ziyad.json",
  "catalog.yemen.json",
  "catalog.wix.json",
];

/* ---- unified categories, in priority order ---- */
const CATEGORIES = [
  {
    slug: "meat", name: "Meat & Poultry",
    description: "Halal beef, chicken, lamb, goat, veal, sausages, and cold cuts.",
    collections: ["Beef", "Chicken", "Goat", "Baby Goat", "Lamb", "Veal", "Cold Cuts", "Soujouk", "Hot Dogs", "Kabobs & Rolls"],
    kw: /\b(beef|chicken|lamb|goat|veal|mutton|sausage|mergu|soujouk|sujuk|kabob|kebab|frank|hot dog|mortadella|salami|pastirma|bologna|cold cut)\b/i,
  },
  {
    slug: "seafood", name: "Fish & Seafood",
    description: "Tinned sardines, tuna, and preserved seafood.",
    collections: ["Canned Seafood", "Sardines & Tuna"],
    kw: /\b(sardine|tuna|mackerel|anchov|shrimp|fish|seafood|calamari)\b/i,
  },
  {
    slug: "dairy-cheese", name: "Dairy & Cheese",
    description: "Cheese, labne, yogurt, and shelf-stable dairy.",
    collections: ["Cheese", "Labne", "Yogurt", "Yogurt Drinks", "Milk", "Milk Powder", "Non-Refrigerated Dairy", "Flavored Milk"],
    kw: /\b(cheese|feta|labne|labneh|yogurt|yoghurt|kashkaval|halloumi|milk powder|butter|cream cheese)\b/i,
  },
  {
    slug: "oils-ghee", name: "Oils & Ghee",
    description: "Olive oil, seed oils, and ghee.",
    collections: ["Olive Oil", "Olive Oil El Ouazzania", "Oil", "Other Oils", "Ghee"],
    kw: /\b(olive oil|sunflower oil|corn oil|vegetable oil|ghee|\boil\b)\b/i,
  },
  {
    slug: "olives-pickles", name: "Olives & Pickles",
    description: "Cured olives, pickles, and grape leaves.",
    collections: ["Olives", "Morocolives", "Pickles", "Grape leaves", "Olives & Pickles"],
    kw: /\b(olive|pickle|grape leaves|torshi|makdous|preserved lemon|condiment)\b/i,
  },
  {
    slug: "spices-herbs", name: "Spices & Herbs",
    description: "Whole and ground spices, blends, herbs, and seasoning.",
    collections: ["Adonis Spices", "Laziza spices", "National Spices Mix", "Regular Spices mix", "SHAN Spices Mix", "Herbs", "Zaatar and Sumac", "Seasoning & Broth", "Salt", "Retail Spices, Marrakesh Spices", "Marrakesh Spices", "Retail Spices", "Herbs & Spices", "Sauces Spice & Herbs"],
    kw: /\b(spice|masala|zaatar|za'atar|sumac|\bsalt\b|pepper|cumin|paprika|turmeric|cinnamon|seasoning|bouillon|broth cube|saffron|harissa powder)\b/i,
  },
  {
    slug: "rice-grains", name: "Rice, Grains & Beans",
    description: "Rice, lentils, beans, chickpeas, bulgur, and semolina.",
    collections: ["Rice", "Lentils", "Beans", "Beans (packed)", "Chickpeas", "Fava Beans", "Bulgar & Semolina", "Semolina", "Seeds"],
    kw: /\b(rice|basmati|lentil|\bbean\b|beans|chickpea|garbanzo|fava|foul|bulgur|bulgar|freekeh|barley|semolina)\b/i,
  },
  {
    slug: "flour-baking", name: "Flour & Baking",
    description: "Flours, starches, and baking essentials.",
    collections: ["Flour", "All Purpose Flour", "Gram Flour", "Wheat Flour", "Baking & Desserts", "Pastry Preparation"],
    kw: /\b(flour|atta|maida|baking|yeast|starch|corn ?flour)\b/i,
  },
  {
    slug: "pasta-couscous", name: "Pasta & Couscous",
    description: "Pasta, vermicelli, and couscous.",
    collections: ["Pastas & Vermicelli", "Pasta", "couscous", "Couscous & Pasta"],
    kw: /\b(pasta|couscous|vermicelli|noodle|macaroni|spaghetti|shariya)\b/i,
  },
  {
    slug: "canned-jarred", name: "Canned & Jarred",
    description: "Canned goods, pastes, sauces, tahini, and vinegar.",
    collections: ["Can Foods", "Canned Foods", "Canned Ready to Eat", "Baba Ghanouj", "Hummus", "Pastes & Sauces", "Vinegar & molasses", "Sauces & Harissa & Vinegar", "Broth & Soups Ideal"],
    kw: /\b(canned|tahini|tahina|hummus|baba ?ghanou|tomato paste|harissa|molasses|vinegar|\bsauce\b|ketchup|mayonnaise)\b/i,
  },
  {
    slug: "bakery-bread", name: "Bakery & Bread",
    description: "Flatbreads, pita, fillo, rusks, and toasts.",
    collections: ["Afghan Flatbread", "Pita Bread", "Other breads", "Fillo & Doughs", "Toasts and Rusks"],
    kw: /\b(pita|flatbread|\bnaan\b|lavash|fillo|filo|phyllo|rusk|toast|baguette|\bbread\b)\b/i,
  },
  {
    slug: "frozen", name: "Frozen",
    description: "Frozen breads, vegetables, desserts, and ready meals.",
    collections: ["Frozen", "Frozen Breads", "Frozen Desserts", "Frozen Ready to Eat", "Frozen Vegetables"],
    kw: /\b(frozen)\b/i,
  },
  {
    slug: "sweets-snacks", name: "Sweets & Snacks",
    description: "Chocolate, cookies, halva, Turkish delight, and snacks.",
    collections: ["Chocolates", "Cookies", "Desserts", "Halva", "Turkish Delight", "Snacks", "Biscuits & Sweets", "Custards (4 Portions)", "Custards (1 Portion)"],
    kw: /\b(chocolate|cookie|biscuit|halva|halawa|turkish delight|lokum|candy|snack|chips|wafer|dessert|custard|maamoul)\b/i,
  },
  {
    slug: "nuts-dates", name: "Nuts, Seeds & Dates",
    description: "Nuts, seeds, and dates.",
    collections: ["Nuts", "Dates"],
    kw: /\b(almond|cashew|pistachio|walnut|hazelnut|peanut|\bnuts?\b|\bdates?\b|sunflower seed|pumpkin seed)\b/i,
  },
  {
    slug: "beverages", name: "Beverages & Water",
    description: "Juices, sodas, teas, coffee, syrups, and water.",
    collections: ["Juices", "Soda", "Sparkling Water", "Malt Drinks (Non-Alcoholic)", "Coffee", "Tea", "Teas", "Drinks", "Syrup", "Zamzam"],
    kw: /\b(juice|soda|cola|sparkling|\bwater\b|malt drink|coffee|\btea\b|syrup|zamzam|ayran|sharbat|drink)\b/i,
  },
  {
    slug: "honey-jams", name: "Honey, Jams & Spreads",
    description: "Honey, jams, and sweet spreads.",
    collections: ["Honey", "Jams & Spreads", "Jams El Baraka"],
    kw: /\b(honey|\bjam\b|jams|marmalade|spread|nutella|chocolate cream|hazelnut cream)\b/i,
  },
  {
    slug: "body-home", name: "Body & Home Care",
    description: "Body care, soaps, and household goods.",
    collections: ["Body Care", "Laundry soap", "COCO Noura Charcoal"],
    kw: /\b(soap|shampoo|lotion|charcoal|detergent|cosmetic)\b/i,
  },
  {
    slug: "kitchen", name: "Kitchen & Tools",
    description: "Kitchenware, utensils, and serving items.",
    collections: ["Kitchen items"],
    kw: /\b(kettle|teapot|tray|utensil|strainer|mortar|pestle|tagine pot)\b/i,
  },
];

const FALLBACK = {
  slug: "pantry", name: "Pantry & Grocery",
  description: "Everyday grocery staples across the range.",
};

// Generic buckets that never define a category or appear as a filter.
const GENERIC = new Set(["Wholesale Orders", "Best Sellers", "ECOM", "Others", "TAYEB Brand", "Leader", "Grocery", "Fresh Produce", "Institutional Food Orders", "goods", "Ramadan Items", "Fattal's Homemade"]);

// Source category names (Ziyad, Fattal's, mog) → unified category slug.
const ALIASES = {
  // Ziyad (WooCommerce)
  "Seasonings & Spices": "spices-herbs", "Grains, Rice & Wheat": "rice-grains",
  Sweets: "sweets-snacks", "Lentils, Beans & Peas": "rice-grains",
  "Snacks & Dips": "sweets-snacks", Dairy: "dairy-cheese",
  "Ready to Eat": "canned-jarred", Vegetables: "canned-jarred",
  "Dates & Dried Fruit": "nuts-dates", Syrups: "beverages",
  "Jams & Honey": "honey-jams", Bakery: "bakery-bread",
  "Seeds & Nuts": "nuts-dates", Pastes: "canned-jarred", Tahini: "canned-jarred",
  // Fattal's (BigCommerce)
  Wheat: "rice-grains", Spices: "spices-herbs", "Canned Foods": "canned-jarred",
  Breads: "bakery-bread", "Coffee & Tea": "beverages", "Baking Supplies": "flour-baking",
  "Nuts & Seeds": "nuts-dates", Herbs: "spices-herbs", "Jarred Foods": "canned-jarred",
  "Dried Fruits": "nuts-dates", "Molasses/Syrups": "canned-jarred", "Falafel Mix": "flour-baking",
  "Vegetable Ghee": "oils-ghee", "Pure Butter Ghee": "oils-ghee", "Extra Virgin Olive Oil": "oils-ghee",
  "Halal Chicken Bouillon": "spices-herbs", Cheese: "dairy-cheese", "Whole Truffles": "canned-jarred",
  // mog (Shopify)
  "Olive oil": "oils-ghee", "Olive Oil": "oils-ghee",
  // Yemen catalog (clean categories; mixed ones fall through to keywords)
  "Biscuits, Candy & Halva": "sweets-snacks", "Juice & Soda": "beverages",
  "Tea & Coffee": "beverages", "Milk & Cheese": "dairy-cheese",
  "Nuts & Seeds": "nuts-dates", "Frozen Products": "frozen",
};

const CAT_BY_SLUG = Object.fromEntries([...CATEGORIES, FALLBACK].map((c) => [c.slug, c]));

/* ---- country of origin ----
 * Inferred conservatively. Demonyms in the name (and a few single-country
 * brands) are reliable; house brands that span many origins are left
 * Unspecified rather than guessed. Fill gaps in data-import/origin-overrides.json
 * ({ "brands": { "brand": "Country" }, "slugs": { "product-slug": "Country" } }).
 */
export const COUNTRY_FLAGS = {
  Morocco: "🇲🇦", Algeria: "🇩🇿", Tunisia: "🇹🇳", Egypt: "🇪🇬", Turkey: "🇹🇷",
  Lebanon: "🇱🇧", Palestine: "🇵🇸", Syria: "🇸🇾", Jordan: "🇯🇴", Iraq: "🇮🇶",
  "Saudi Arabia": "🇸🇦", "United Arab Emirates": "🇦🇪", Yemen: "🇾🇪", Iran: "🇮🇷",
  Pakistan: "🇵🇰", India: "🇮🇳", Afghanistan: "🇦🇫", Greece: "🇬🇷", Italy: "🇮🇹",
  Spain: "🇪🇸", France: "🇫🇷", "United Kingdom": "🇬🇧", "United States": "🇺🇸",
};

// Demonyms / strong single-signal keywords → country (tested on name + collections).
const DEMONYMS = [
  [/\bmorocc|\bmaroc|ouazzania|maghrib|marrakesh|argan/i, "Morocco"],
  [/\balgeri|mordjene|amor ben ?amor/i, "Algeria"],
  [/\btunisia|\bnabeul/i, "Tunisia"],
  [/\begypt/i, "Egypt"],
  [/\bturkish|\bturkey\b|türk|\bantep\b|\bmaras\b/i, "Turkey"],
  [/\blebanese|\blebanon\b|\bbaalbek/i, "Lebanon"],
  [/\bpalestin|\bnabulsi|al[' ]?ard/i, "Palestine"],
  [/\bsyrian|\baleppo|\bdamascus|holw el sham/i, "Syria"],
  [/\bjordan/i, "Jordan"],
  [/\biraqi|\biraq\b/i, "Iraq"],
  [/\bsaudi|\bzamzam|almarai|alameed|\bmecca|\bmedina/i, "Saudi Arabia"],
  [/\bemirati|\bdubai|california garden/i, "United Arab Emirates"],
  [/\byemeni|\byemen\b/i, "Yemen"],
  [/\bpersian|\biranian|\biran\b/i, "Iran"],
  [/\bpakistan|\bshan\b|laziza|\btapal\b|\bnational\b|karachi/i, "Pakistan"],
  [/\bindian\b|\bindia\b|\bhaldiram|\bmdh\b/i, "India"],
  [/\bafghan/i, "Afghanistan"],
  [/\bgreek\b|\bgreece\b|krinos/i, "Greece"],
  [/\bitalian\b|\bitaly\b/i, "Italy"],
  [/\bspanish\b|\bspain\b/i, "Spain"],
];

// Single-country brands (brand field, lowercased). House/importer brands that
// span origins (Ziyad, Fattal's, Sahadi, Nestle, Vimto) are intentionally absent.
const BRAND_ORIGIN = {
  "moroccan olive grove": "Morocco", "el ouazzania": "Morocco", ouazzania: "Morocco",
  "al maghribya": "Morocco", alshark: "Morocco", "al-ghazal": "Morocco",
  "el mordjene": "Algeria",
  duru: "Turkey", torku: "Turkey", ülker: "Turkey", ulker: "Turkey", "içim": "Turkey", icim: "Turkey",
  castania: "Lebanon", "al wadi": "Lebanon", "cafe najjar coffee": "Lebanon", cortas: "Lebanon", baroody: "Lebanon",
  krinos: "Greece",
  "california garden": "United Arab Emirates",
  shan: "Pakistan", national: "Pakistan", laziza: "Pakistan", tapal: "Pakistan",
  almarai: "Saudi Arabia", "alameed coffee": "Saudi Arabia",
  "holw el sham": "Syria",
};

let ORIGIN_OVERRIDES = { brands: {}, slugs: {} };
try {
  ORIGIN_OVERRIDES = JSON.parse(fs.readFileSync(`${DIR.replace("src/lib/catalog", "data-import")}/origin-overrides.json`, "utf8"));
} catch {
  /* optional file */
}

// Sources whose catalog is single-country by nature. La Vague's own (Wix)
// range and Moroccan Olive Grove are Moroccan importers, so anything from them
// without a clearer signal is Moroccan. General importers (halalco, Ziyad,
// Fattal's) span many origins and get no source default.
// Ziyad Brothers is a Lebanese-American importer whose range is typically
// Lebanese/Syrian/Turkish; default to Lebanon, and let name keywords split off
// the Turkish (Turkey) and Syrian (Aleppo/Damascus) items above.
const SOURCE_ORIGIN = { wix: "Morocco", mog: "Morocco", ziyad: "Lebanon" };

function assignOrigin(p) {
  const slug = p.slug || slugify(p.name);
  if (ORIGIN_OVERRIDES.slugs?.[slug]) return ORIGIN_OVERRIDES.slugs[slug];
  const brandKey = (p.brand || "").toLowerCase().trim();
  if (brandKey && ORIGIN_OVERRIDES.brands?.[brandKey]) return ORIGIN_OVERRIDES.brands[brandKey];
  if (p.origin) return p.origin; // set explicitly by a source importer
  // A clear country signal in the name/brand always wins over the source
  // default, so Egyptian Schweppes, Zamzam, El Mordjene stay correct.
  const hay = `${p.name} ${(p.collections || []).join(" ")}`;
  for (const [re, country] of DEMONYMS) if (re.test(hay)) return country;
  if (brandKey && BRAND_ORIGIN[brandKey]) return BRAND_ORIGIN[brandKey];
  if (p.source && SOURCE_ORIGIN[p.source]) return SOURCE_ORIGIN[p.source];
  return null;
}

function categorize(product) {
  const cols = product.collections || [];
  // 1) explicit source-category alias
  for (const c of cols) if (ALIASES[c]) return CAT_BY_SLUG[ALIASES[c]];
  // 2) unified collection exact match
  for (const cat of CATEGORIES) if (cols.some((c) => cat.collections.includes(c))) return cat;
  // 3) keyword on name + collections
  const hay = `${product.name} ${cols.join(" ")}`;
  for (const cat of CATEGORIES) if (cat.kw.test(hay)) return cat;
  return FALLBACK;
}

function slugify(s) {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").slice(0, 70) || "item"
  );
}
const normName = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

/* ---- merge ---- */
const loaded = [];
for (const file of SOURCES) {
  const path = `${DIR}/${file}`;
  if (!fs.existsSync(path)) {
    console.warn("  (skip, not found)", file);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  // Tag each product with its source (the Wix importer predates the field), so
  // origin inference can apply source-level defaults.
  const srcName = file.replace("catalog.", "").replace(".json", "");
  for (const p of data.products) if (!p.source) p.source = srcName;
  loaded.push({ file, count: data.products.length, products: data.products });
}

const merged = new Map();
const order = [];
function add(product) {
  const key = normName(product.name);
  const existing = merged.get(key);
  if (!existing) {
    merged.set(key, product);
    order.push(key);
    return;
  }
  // Collision: keep the priced record; union collections.
  const existingPriced = existing.variants[0].retailPriceCents != null;
  const incomingPriced = product.variants[0].retailPriceCents != null;
  const keep = existingPriced || !incomingPriced ? existing : product;
  const drop = keep === existing ? product : existing;
  keep.collections = [...new Set([...(keep.collections || []), ...(drop.collections || [])])];
  if (!keep.imageUrl && drop.imageUrl) keep.imageUrl = drop.imageUrl;
  if (!keep.ribbon && drop.ribbon) keep.ribbon = drop.ribbon;
  if ((drop.description || "").length > (keep.description || "").length) keep.description = drop.description;
  merged.set(key, keep);
}
for (const src of loaded) src.products.forEach(add);

// Categorize the merged records (keep source for grouping).
const records = [];
for (const key of order) {
  const p = merged.get(key);
  if (!p) continue;
  const cat = categorize(p);
  records.push({ ...p, origin: assignOrigin(p), categorySlug: cat.slug, categoryName: cat.name });
}

/* ---- variation grouping ----
 * Two safe cases collapse into a single listing with a variant dropdown:
 *  1. Size variants of one product from the SAME source (identical name once
 *     size/pack tokens are stripped) — e.g. "…El Ouazzania 1l / 2l / 5l".
 *     Same-source keeps different brands (whose brand is in the name) apart.
 *  2. A curated brand line (Morocolives) — its many olive TYPES become options.
 */
const SIZE_TOKEN = /\b\d+(?:\.\d+)?\s*[x*]\s*\d+(?:\.\d+)?\s*(?:oz|g|gr|kg|lb|lbs|ml|l|cl|ct)?\b|\b\d+(?:\.\d+)?\s*(?:oz|g|gr|kg|lb|lbs|ml|l|cl|ct|count|pcs?|pack|kilo|gallon|liter|litre)\b|\bcase of \d+\b/gi;
const CONTAINER = /\b(tin|bottle|jar|can|pouch|bag|pail|box|container|packet|sachet)\b/gi;
const BRAND_LINES = [{ prefix: "morocolives", name: "Morocolives" }];

function stripSize(name) {
  return name.replace(/\([^)]*\)/g, " ").replace(/-\s*\$[\d.]+\s*(?:\/\s*lb)?/gi, " ")
    .replace(SIZE_TOKEN, " ").replace(CONTAINER, " ").replace(/[\s\-–—]+$/, "").replace(/\s+/g, " ").trim();
}
function baseName(name) {
  return stripSize(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function sizeLabel(name) {
  const paren = name.match(/\(([^)]*(?:oz|g|kg|lb|ml|l|ct|pack|count)[^)]*)\)/i);
  if (paren) return paren[1].trim().replace(/\s+/g, " ");
  const m = name.match(SIZE_TOKEN);
  return m ? m[0].trim().replace(/\s+/g, " ") : null;
}
function brandLine(name) {
  const n = name.toLowerCase().trim();
  return BRAND_LINES.find((b) => n.startsWith(b.prefix)) || null;
}
function prettyUnit(sizeStr) {
  return sizeStr.trim().replace(/\s+/g, " ")
    .replace(/\blbs\b/gi, "lb").replace(/\boz\b/gi, "oz").replace(/\bkg\b/gi, "kg")
    .replace(/\bgr\b/gi, "g").replace(/\bml\b/gi, "ml").replace(/\bcl\b/gi, "cl").replace(/\bl\b/gi, "L");
}

/**
 * Reads a pack/size descriptor into a case profile.
 *  "12*1 Lbs"  → { unitsPerCase: 12, unitLabel: "1 lb", label: "Case of 12 × 1 lb" }
 *  "500 ml"    → { unitsPerCase: null, unitLabel: "500 ml", label: "500 ml" }
 */
function parsePack(name) {
  const caseMatch = name.match(/\b(\d+)\s*[x*]\s*(\d+(?:\.\d+)?)\s*(oz|g|gr|kg|lb|lbs|ml|l|cl)?\b/i);
  if (caseMatch) {
    const units = parseInt(caseMatch[1], 10);
    const unitLabel = prettyUnit(caseMatch[2] + (caseMatch[3] ? " " + caseMatch[3] : ""));
    return { unitsPerCase: units, unitLabel, label: `Case of ${units} × ${unitLabel}` };
  }
  const caseOf = name.match(/case of\s+(\d+)/i);
  if (caseOf) {
    const s = sizeLabel(name);
    return { unitsPerCase: parseInt(caseOf[1], 10), unitLabel: s, label: s ? `Case of ${caseOf[1]} × ${prettyUnit(s)}` : `Case of ${caseOf[1]}` };
  }
  const size = sizeLabel(name);
  return { unitsPerCase: null, unitLabel: size, label: size ? prettyUnit(size) : null };
}
// Source-catalog spelling fixes, applied to option labels.
const TYPO_FIXES = [
  [/\bgrillled\b/gi, "grilled"],
  [/\bkalamatta\b/gi, "kalamata"],
  [/\bgiardinera\b/gi, "giardiniera"],
];

// A clean, human option label: strip the pack/size noise, expand "w/", Title Case.
function cleanTypeLabel(raw) {
  const stopwords = new Set(["with", "and", "of", "in", "the", "w"]);
  let t = raw
    .replace(/\([^)]*\)?/g, " ") // parentheticals, incl. a truncated "(ble"
    .replace(SIZE_TOKEN, " ")
    .replace(CONTAINER, " ")
    .replace(/\bw\//gi, "with ")
    .replace(/\b\d+\/\d+\b/g, " ") // olive calibre grades like 19/21
    .replace(/[\s\-–—]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (const [re, to] of TYPO_FIXES) t = t.replace(re, to);
  t = t.replace(/\s{2,}/g, " ").trim();
  if (!t) return "Standard";
  return t
    .toLowerCase()
    .split(" ")
    .map((word, i) =>
      i > 0 && stopwords.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function groupRecords(recs) {
  const groups = new Map();
  const keyOrder = [];
  for (const r of recs) {
    const bl = brandLine(r.name);
    let key;
    if (bl) key = "brand:" + bl.prefix;
    else {
      const b = baseName(r.name);
      key = b.length >= 6 ? `size:${r.source || "x"}|${r.categorySlug}|${b}` : `solo:${r.id}`;
    }
    if (!groups.has(key)) { groups.set(key, []); keyOrder.push(key); }
    groups.get(key).push(r);
  }
  const out = [];
  for (const key of keyOrder) {
    const members = groups.get(key);
    out.push(members.length === 1 ? members[0] : mergeVariants(key, members));
  }
  return out;
}

function mergeVariants(key, members) {
  const bl = key.startsWith("brand:") ? BRAND_LINES.find((b) => key === "brand:" + b.prefix) : null;
  const withImg = members.filter((m) => m.imageUrl);
  const rep = (withImg.length ? withImg : members).slice().sort((a, b) => a.name.length - b.name.length)[0];
  const displayName = bl ? bl.name : stripSize(rep.name) || rep.name;

  // Build candidate variants. For a brand line the option is the product TYPE,
  // so clean it up (drop pack-size noise, expand "w/", Title Case); for a size
  // group the option is the size itself.
  const candidates = members.map((m) => {
    let label;
    let pack = null;
    let unitsPerCase = m.variants[0]?.unitsPerCase ?? null;
    if (bl) {
      const stripped = m.name.replace(new RegExp(bl.prefix, "gi"), " ").replace(/^[\s\-–—]+/, "");
      const pk = parsePack(stripped);
      pack = pk.label;
      unitsPerCase = pk.unitsPerCase ?? unitsPerCase;
      label = cleanTypeLabel(stripped);
    } else {
      const pk = parsePack(m.name);
      unitsPerCase = pk.unitsPerCase ?? unitsPerCase;
      label = pk.label || (m.variants[0]?.name && m.variants[0].name !== "Each" ? m.variants[0].name : null) || "Option";
    }
    return { label, pack, unitsPerCase, v: m.variants[0] || {}, m };
  });

  // Drop true duplicates: brand lines dedupe by SKU (keep every distinct pack);
  // size groups dedupe by size+price (same size, same price = the same listing).
  const byKey = new Map();
  for (const c of candidates) {
    const key = bl ? (c.v.sku || c.label).toLowerCase() : c.label.toLowerCase() + "|" + (c.v.retailPriceCents ?? "na");
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const kept = [...byKey.values()];
  const labelCounts = {};
  for (const c of kept) labelCounts[c.label.toLowerCase()] = (labelCounts[c.label.toLowerCase()] || 0) + 1;

  const variants = kept.map(({ label, pack, unitsPerCase, v, m }) => {
    // Only disambiguate when two options share a label: by pack for a brand
    // line, by price for a size group.
    let lab = label;
    if (labelCounts[label.toLowerCase()] > 1) {
      if (bl && pack) lab = `${label} · ${pack}`;
      else if (!bl && v.retailPriceCents != null) lab = `${label} — $${(v.retailPriceCents / 100).toFixed(2)}`;
    }
    return {
      id: v.id || m.id + "_v", sku: v.sku, name: lab,
      retailPriceCents: v.retailPriceCents ?? null, compareAtPriceCents: v.compareAtPriceCents ?? null,
      unitsPerCase: unitsPerCase ?? null, minOrderCases: v.minOrderCases ?? null, inStock: v.inStock !== false,
    };
  });
  return {
    ...rep,
    name: displayName,
    isFeatured: members.some((m) => m.isFeatured),
    ribbon: members.map((m) => m.ribbon).find(Boolean) || null,
    imageUrl: rep.imageUrl || members.map((m) => m.imageUrl).find(Boolean) || null,
    description: members.map((m) => m.description || "").sort((a, b) => b.length - a.length)[0],
    collections: [...new Set(members.flatMap((m) => m.collections || []))],
    variants,
  };
}

const grouped = groupRecords(records);

// Assign unique slugs/skus and drop internal fields.
const usedSlugs = new Set();
const usedSkus = new Set();
const usedCats = new Map();
const products = [];

for (const p of grouped) {
  usedCats.set(p.categorySlug, CAT_BY_SLUG[p.categorySlug]);

  let slug = p.slug || slugify(p.name);
  let s = slug, n = 2;
  while (usedSlugs.has(s)) s = `${slug}-${n++}`;
  slug = s; usedSlugs.add(slug);

  const variants = p.variants.map((v, i) => {
    let sku = v.sku || `LV-${slug}`.toUpperCase().slice(0, 40);
    let sk = sku, k = 2;
    while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
    sku = sk; usedSkus.add(sku);
    // Derive a case size (units per case) from the product name when not already
    // set — e.g. a name containing "12*1 Lbs" implies 12 units per case.
    const unitsPerCase = v.unitsPerCase ?? parsePack(p.name).unitsPerCase;
    return {
      id: v.id, sku, name: v.name,
      retailPriceCents: v.retailPriceCents ?? null, compareAtPriceCents: v.compareAtPriceCents ?? null,
      unitsPerCase: unitsPerCase ?? null, minOrderCases: v.minOrderCases ?? null,
      inStock: v.inStock !== false, position: i,
    };
  });

  products.push({
    id: p.id,
    slug,
    name: p.name,
    tagline: p.tagline ?? null,
    description: p.description,
    origin: p.origin ?? null,
    brand: p.brand ?? null,
    imageUrl: p.imageUrl ?? null,
    ribbon: p.ribbon ?? null,
    isFeatured: Boolean(p.isFeatured),
    categorySlug: p.categorySlug,
    categoryName: p.categoryName,
    collections: (p.collections || []).filter((c) => !GENERIC.has(c)),
    variants,
  });
}

// Cross-source image backfill: a product missing a photo borrows one from
// another source's listing of the same product (identical name once size/pack
// is stripped). The length guard avoids borrowing on over-generic base names.
const imageByBase = new Map();
for (const p of products) {
  if (!p.imageUrl) continue;
  const b = baseName(p.name);
  if (b.length >= 12 && !imageByBase.has(b)) imageByBase.set(b, p.imageUrl);
}
let backfilled = 0;
for (const p of products) {
  if (p.imageUrl) continue;
  const img = imageByBase.get(baseName(p.name));
  if (img) {
    p.imageUrl = img;
    backfilled += 1;
  }
}

// Categories that ended up with products, in priority order.
const catPriority = [...CATEGORIES, FALLBACK].map((c) => c.slug);
const categories = [...usedCats.values(), FALLBACK]
  .filter((c, i, arr) => arr.findIndex((x) => x.slug === c.slug) === i)
  .filter((c) => products.some((p) => p.categorySlug === c.slug))
  .sort((a, b) => catPriority.indexOf(a.slug) - catPriority.indexOf(b.slug))
  .map((c) => ({ id: "cat_" + c.slug, slug: c.slug, name: c.name, description: c.description }));

// Collection filters from all non-generic collections actually used.
const colCounts = new Map();
for (const p of products) for (const c of p.collections) colCounts.set(c, (colCounts.get(c) || 0) + 1);
const collections = [...colCounts.entries()]
  .filter(([, n]) => n >= 2)
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, slug: slugify(name), count }));

// Country-of-origin filters, with flags, most stocked first.
const countryCounts = new Map();
for (const p of products) if (p.origin) countryCounts.set(p.origin, (countryCounts.get(p.origin) || 0) + 1);
const countries = [...countryCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, slug: slugify(name), flag: COUNTRY_FLAGS[name] ?? "🌍", count }));

fs.writeFileSync(OUT, JSON.stringify({ categories, collections, countries, products }, null, 2));

const priced = products.filter((p) => p.variants[0].retailPriceCents != null).length;
const inputTotal = loaded.reduce((s, x) => s + x.count, 0);
const multiVariant = products.filter((p) => p.variants.length > 1);
console.log("Wrote", OUT);
console.log("  sources:", loaded.map((x) => `${x.file.replace("catalog.", "").replace(".json", "")}(${x.count})`).join(" + "));
console.log("  input rows:", inputTotal, "→ listings:", products.length, "| priced:", priced);
console.log("  grouped listings (multi-variant):", multiVariant.length, "| variants folded in:", multiVariant.reduce((s, p) => s + p.variants.length, 0));
console.log("  largest groups:");
multiVariant.sort((a, b) => b.variants.length - a.variants.length).slice(0, 12)
  .forEach((p) => console.log("   ", String(p.variants.length).padStart(3), p.name, "—", p.variants.map((v) => v.name).slice(0, 6).join(" / ").slice(0, 90)));
const withImg = products.filter((p) => p.imageUrl).length;
console.log("  images:", withImg, `of ${products.length} (${Math.round((withImg / products.length) * 100)}%); backfilled ${backfilled} cross-source, ${products.length - withImg} without a photo`);
console.log("  categories:", categories.length, "| collection filters:", collections.length);
const labelled = products.filter((p) => p.origin).length;
console.log("  origin labelled:", labelled, `of ${products.length} (${Math.round((labelled / products.length) * 100)}%) across ${countries.length} countries; ${products.length - labelled} unspecified`);
console.log("  countries:");
for (const c of countries) console.log("   ", c.flag, String(c.count).padStart(4), c.name);
