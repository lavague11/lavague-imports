// Assigns Product.origin for source='noura' products by brand of origin.
// Only confident brand->country mappings are applied; uncertain brands are
// left null and reported. Dry run: DRY=1 node scripts/assign-noura-origins.mjs
import "dotenv/config";
import pg from "pg";

const DRY = process.env.DRY === "1";

// Ordered brand/product -> country of origin; first match wins.
const ORIGIN = [
  // Morocco
  [/\btayeb\b/i, "Morocco"],
  [/\bsultan\b/i, "Morocco"],
  [/\brasila\b|rasilah/i, "Morocco"],
  [/\bbelma\b/i, "Morocco"],
  [/\bomega\b/i, "Morocco"],
  [/\bdoussy\b/i, "Morocco"],
  [/\banabel\b/i, "Morocco"],
  [/\bideal\b|oualili|el baraka|el ouazzania|\bsafi\b/i, "Morocco"],
  // Tunisia
  [/\bsaida\b/i, "Tunisia"],
  [/cap bon|flamme/i, "Tunisia"],
  [/\bsable\b/i, "Tunisia"],
  // Algeria
  [/\bngaous\b/i, "Algeria"],
  // Egypt — Noura pastry/dough + Egyptian brands & bakery
  [/\bnoura\b|kunafa|baklava|qatayef|samousa|samosa|phyllo|fillo|kataifi|balloriya|borma|bulbul/i, "Egypt"],
  [/coffee break|el arosa|el bawadi|double dare|\bsnaps\b|excellent|ghorayeba|\bkahk\b|malban/i, "Egypt"],
  [/watermelon super seeds|\bnour\b/i, "Egypt"],
  [/biscuits mix|orange biscuits|plain biscuits|coconut biscuits/i, "Egypt"],
];
const originFor = (name) => (ORIGIN.find(([re]) => re.test(name)) ?? [null, null])[1];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = (await c.query(`SELECT id, name FROM "Product" WHERE source='noura' ORDER BY name`)).rows;

const dist = {};
const unassigned = [];
let updated = 0;
for (const p of rows) {
  const origin = originFor(p.name);
  if (!origin) { unassigned.push(p.name); continue; }
  dist[origin] = (dist[origin] || 0) + 1;
  updated++;
  if (!DRY) await c.query(`UPDATE "Product" SET origin=$1, "updatedAt"=now() WHERE id=$2`, [origin, p.id]);
}

console.log(`${DRY ? "[DRY] " : ""}assigned origin to ${updated}/${rows.length}`);
console.log("by country:", JSON.stringify(dist));
console.log(`\nunassigned (${unassigned.length}) — left blank for review:`);
unassigned.forEach((n) => console.log("  " + n));
await c.end();
