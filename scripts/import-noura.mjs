// Imports the Noura USA LLC catalog products that are missing from La Vague
// (parsed from noura_rows.json, derived from the supplied spreadsheet).
// No prices or images are available in the source, so these come in quote-only
// with inferred categories; isCustom so they survive a re-seed.
// Dry run: DRY=1 node scripts/import-noura.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const DRY = process.env.DRY === "1";
const ROWS = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/C--Users-La-Vague-Desktop-La-Vague-Imports/f44646aa-96cc-4c86-ab98-a05e3e2edd9b/scratchpad/noura_rows.json";

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// Ordered keyword -> category rules; first match wins, default "pantry".
const RULES = [
  [/olive oil/i, "oils-ghee"],
  [/\bghee\b|\bsmen\b|argan oil|sunflower oil|corn oil|vegetable oil/i, "oils-ghee"],
  [/honey|eucalyptus honey/i, "honey-jams"],
  [/\bjam\b|marmalade|molasses|confiture|fig jam|date paste|spread\b|tahini|tahina/i, "honey-jams"],
  [/sardine|tuna|anchov|mackerel|\bfish\b|seafood|shrimp|calamari/i, "seafood"],
  [/preserved lemon|olives?\b|caper|torshi/i, "olives-pickles"],
  [/pickle|mekhalel|mixed vegetables in brine/i, "olives-pickles"],
  [/coffee|cappuccino|nescafe|latte|mehawega/i, "beverages"],
  [/\btea\b|green tea|gunpowder|\bchai\b|jawhar|matcha/i, "beverages"],
  [/soft drink|\bsoda\b|cola|\bjuice\b|nectar|\bsnaps\b|drink\b|sparkling|\bwater\b|syrup/i, "beverages"],
  [/noodle|vermicelli|macaroni|\bpasta\b|couscous|spaghetti/i, "pasta-couscous"],
  [/kunafa|baklava|samousa|samosa|spring roll|filo|phyllo|malsouka|warka|\bbrick\b|pastry sheet|\bsheets?\b|\bleaves\b|\bdough\b|qatayef|\bcrepe|\bkahk\b/i, "bakery-bread"],
  [/harissa|tomato paste|tomato sauce|\bsauce\b|\bpuree\b|\bfoul\b|fava|hummus|ready to eat|canned|jarred|beans with|\bsoup\b|harira|bissara/i, "canned-jarred"],
  [/spice|pepper|cumin|coriander|turmeric|paprika|oregano|basil|thyme|za.?atar|sumac|cinnamon|clove|cardamom|ginger|fennel|anise|laurel|bay leaf|\bmint\b|parsley|\bdill\b|sesame|nigella|caraway|saffron|masala|seasoning|\bherb|\bbunch\b|semolina blend|onion semolina|pizza spice|garlic|ras el hanout|rosemary|\bcurry\b|nutmeg|lavender|chamomile|wormwood|pennyroyal|hibiscus|verbena/i, "spices-herbs"],
  [/biscuit|petit four|cookie|wafer|\bcake\b|\bcone\b|\brusk\b|\btoast\b|cracker|\btuc\b|croissant|prince|croustina|saida break/i, "sweets-snacks"],
  [/chocolate|candy|halva|halawa|turkish delight|marshmallow|fluffy|melty|\bgum\b|lollipop|jelly|nougat|sweet|dessert|custard|vanilla sugar|\bsugar\b|petit beurre|\boriginal\b/i, "sweets-snacks"],
  [/almond|walnut|pistachio|cashew|\bdates?\b|raisin|dried fruit|\bseeds?\b|\bnuts?\b/i, "nuts-dates"],
  [/milk|cheese|yogurt|labne|labneh|\bcream\b|butter|dairy/i, "dairy-cheese"],
  [/\bflour\b|baking powder|\byeast\b|starch|baking soda|vanilla powder/i, "flour-baking"],
  [/rice\b|bulgur|bulgar|freekeh|lentil|\bbeans?\b|chickpea|\bwheat\b|grain|semolina/i, "rice-grains"],
  [/\bpot\b|cooker|steamer|\bpan\b|utensil|kitchen|\btool\b|\bmold\b|\btray\b|tagine|couscoussier/i, "kitchen"],
  [/soap|detergent|laundry|cleaner|shampoo|body|home care|charcoal|coco noura/i, "body-home"],
  [/chicken|\bbeef\b|\blamb\b|\bgoat\b|\bmeat\b|poultry|sausage|hot dog|mortadella|luncheon/i, "meat"],
];
const classify = (name) => (RULES.find(([re]) => re.test(name)) ?? [null, "pantry"])[1];

const caseCount = (cp) => {
  if (!cp) return null;
  const m = cp.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

const data = JSON.parse(readFileSync(ROWS, "utf8"));
const items = data.slice(8).filter((r) => r[0] && r[1]); // [sku,product,size,casePack,gap,page,source,notes]

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const dist = {};
const seen = new Set();
let added = 0, skipped = 0;
const fallbacks = [];
for (const r of items) {
  const [sku, name, size, casePack, gap, , , notes] = r;
  const cat = classify(name);
  dist[cat] = (dist[cat] || 0) + 1;
  if (cat === "pantry") fallbacks.push(name);

  let slug = slugify(name);
  if (seen.has(slug)) slug = `${slug}-${sku.toLowerCase().replace(/[^a-z0-9]+/g, "")}`.slice(0, 70);
  seen.add(slug);

  const exists = await c.query(`SELECT 1 FROM "Product" WHERE slug=$1`, [slug]);
  if (exists.rowCount) { skipped++; continue; }

  const upc = caseCount(casePack);
  const descParts = [];
  if (size) descParts.push(`Size: ${size}.`);
  if (casePack) descParts.push(`Case pack: ${casePack}.`);
  if (notes && gap === "NEW") descParts.push("New addition to the range.");
  const desc = descParts.join(" ") || `${name}.`;

  if (!DRY) {
    const id = `custom_${slug}`;
    await c.query(
      `INSERT INTO "Product" (id,slug,name,description,origin,brand,"imageUrl",images,source,"minPriceCents",collections,"isActive","isFeatured","isFragile","isCustom",position,"categoryId","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,NULL,NULL,NULL,ARRAY[]::text[],'noura',NULL,ARRAY[]::text[],true,false,false,true,0,$5,now(),now())`,
      [id, slug, name, desc, `cat_${cat}`],
    );
    await c.query(
      `INSERT INTO "ProductVariant" (id,sku,name,"productId","unitsPerCase","retailPriceCents","inStock",position) VALUES ($1,$2,$3,$4,$5,NULL,true,0)`,
      [`var_${slug}`, sku, size || "Each", id, upc],
    );
  }
  added++;
}

console.log(`${DRY ? "[DRY] " : ""}candidates: ${items.length}  added: ${added}  skipped(exists): ${skipped}`);
console.log("category distribution:", JSON.stringify(dist, null, 0));
console.log(`\npantry fallbacks (${fallbacks.length}):`);
fallbacks.forEach((n) => console.log("  " + n));
await c.end();
