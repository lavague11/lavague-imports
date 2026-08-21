// Authoritative Noura import: resets all source='noura' products and imports
// exactly the deduped "Add" list (scripts/noura-add-list.json) — the 140
// genuinely-new products, excluding confirmed/likely duplicates and size-only
// variants per the user's deduped spreadsheet. Quote-only, isCustom.
// Dry run: DRY=1 node scripts/import-noura-final.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const DRY = process.env.DRY === "1";
const here = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(here, "noura-add-list.json"), "utf8"));

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
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
  [/kunafa|baklava|samousa|samosa|spring roll|filo|phyllo|malsouka|warka|\bbrick\b|pastry sheet|\bsheets?\b|\bleaves\b|\bdough\b|qatayef|\bcrepe|\bkahk\b|cornet|borma/i, "bakery-bread"],
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
const caseCount = (cp) => { const m = (cp || "").match(/(\d+)/); return m ? parseInt(m[1], 10) : null; };

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

if (!DRY) {
  const del = await c.query(`SELECT id FROM "Product" WHERE source='noura'`);
  for (const r of del.rows) {
    await c.query(`DELETE FROM "ProductVariant" WHERE "productId"=$1`, [r.id]);
    await c.query(`DELETE FROM "Product" WHERE id=$1`, [r.id]);
  }
  console.log(`reset: removed ${del.rowCount} existing noura products`);
}

const dist = {};
const seen = new Set();
let added = 0;
for (const it of items) {
  const cat = classify(it.name);
  dist[cat] = (dist[cat] || 0) + 1;
  let slug = slugify(it.name);
  if (seen.has(slug)) slug = `${slug}-${it.sku.toLowerCase().replace(/[^a-z0-9]+/g, "")}`.slice(0, 70);
  seen.add(slug);
  const upc = caseCount(it.casePack);
  const desc = [it.size && `Size: ${it.size}.`, it.casePack && `Case pack: ${it.casePack}.`].filter(Boolean).join(" ") || `${it.name}.`;
  if (DRY) { added++; continue; }
  const id = `custom_${slug}`;
  await c.query(
    `INSERT INTO "Product" (id,slug,name,description,origin,brand,"imageUrl",images,source,"minPriceCents",collections,"isActive","isFeatured","isFragile","isCustom",position,"categoryId","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,NULL,NULL,NULL,ARRAY[]::text[],'noura',NULL,ARRAY[]::text[],true,false,false,true,0,$5,now(),now())`,
    [id, slug, it.name, desc, `cat_${cat}`],
  );
  await c.query(
    `INSERT INTO "ProductVariant" (id,sku,name,"productId","unitsPerCase","retailPriceCents","inStock",position) VALUES ($1,$2,$3,$4,$5,NULL,true,0)`,
    [`var_${slug}`, it.sku, it.size || "Each", id, upc],
  );
  added++;
}
console.log(`${DRY ? "[DRY] " : ""}imported ${added} of ${items.length}`);
console.log("categories:", JSON.stringify(dist));
await c.end();
