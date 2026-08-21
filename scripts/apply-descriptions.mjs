// Applies hand-written descriptions (scripts/noura-descriptions.json) to the
// products that were missing a real one. Noura products are isCustom, so a
// direct Product.description update persists through a re-seed.
// Dry run: DRY=1 node scripts/apply-descriptions.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const DRY = process.env.DRY === "1";
const here = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(join(here, "noura-descriptions.json"), "utf8"));

const short = Object.entries(map).filter(([, d]) => d.trim().length < 45);
if (short.length) {
  console.log("WARNING — descriptions under 45 chars (would still flag as 'no description'):");
  short.forEach(([s, d]) => console.log(`  ${s}: "${d}"`));
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

let updated = 0, missing = 0;
for (const [slug, desc] of Object.entries(map)) {
  const r = await c.query(`SELECT id FROM "Product" WHERE slug=$1`, [slug]);
  if (!r.rowCount) { console.log(`no product for slug: ${slug}`); missing++; continue; }
  if (!DRY) await c.query(`UPDATE "Product" SET description=$1, "updatedAt"=now() WHERE slug=$2`, [desc.trim(), slug]);
  updated++;
}
console.log(`\n${DRY ? "[DRY] would update" : "updated"} ${updated} descriptions  (missing slugs: ${missing}, total in file: ${Object.keys(map).length})`);
await c.end();
