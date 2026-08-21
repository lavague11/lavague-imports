// Imports Vallillo olive oils (from their WooCommerce Store API JSON) as custom
// Italy-origin products in Oils & Ghee. Images are stored in MediaAsset.
// Dry run:  DRY=1 node scripts/import-vallillo.mjs
// Apply:    node scripts/import-vallillo.mjs
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const DRY = process.env.DRY === "1";
const JSON_PATH = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/C--Users-La-Vague-Desktop-La-Vague-Imports/f44646aa-96cc-4c86-ab98-a05e3e2edd9b/scratchpad/vallillo.json";

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

function build(name) {
  const isCan = /latta/i.test(name);
  const ml = name.match(/(\d+)\s*ml/i);
  const l = name.match(/(\d+)\s*l\b/i);
  const size = ml ? `${ml[1]} ml` : l ? `${l[1]} L` : "";
  const type = /monocultivar\s+provenzale/i.test(name) ? "Monocultivar Provenzale" : /blend/i.test(name) ? "Blend" : "";
  const label = `Vallillo Extra Virgin Olive Oil ${size}${isCan ? " Can" : ""}${type ? ` \u2014 ${type}` : ""}`.replace(/\s{2,}/g, " ").trim();
  const fragile = /ml/i.test(size); // glass bottles; cans aren't fragile
  const desc = `Cold-pressed extra virgin olive oil from Vallillo, produced in Italy${type ? ` (${type})` : ""}. Packaged in ${size || "assorted sizes"}${isCan ? " cans" : ""}. Imported direct.`;
  const typeCode = type === "Monocultivar Provenzale" ? "M" : type === "Blend" ? "B" : "P";
  const sku = `VAL-${size.replace(/\s+/g, "").toUpperCase() || "STD"}-${typeCode}`;
  return { label, size, fragile, desc, sku };
}

async function storeImage(client, url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const t = buf[0] === 0x89 ? "image/png" : "image/jpeg";
    const id = randomBytes(16).toString("hex");
    if (!DRY) await client.query(`INSERT INTO "MediaAsset" (id,"contentType",data) VALUES ($1,$2,$3)`, [id, t, buf]);
    return `/media/${id}`;
  } catch {
    return null;
  }
}

const all = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const oils = all.filter((p) => /olio extra vergine|olive oil/i.test(p.name));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

let added = 0;
for (const p of oils) {
  const { label, size, fragile, desc, sku } = build(p.name);
  const slug = slugify(label);
  const exists = await c.query(`SELECT 1 FROM "Product" WHERE slug=$1`, [slug]);
  if (exists.rowCount) { console.log(`skip (exists): ${label}`); continue; }
  const imgUrl = p.images && p.images[0] && p.images[0].src ? await storeImage(c, p.images[0].src) : null;
  console.log(`${DRY ? "[DRY] " : ""}+ ${label}  | size=${size} fragile=${fragile} img=${imgUrl ? "yes" : "no"}`);
  if (DRY) { added++; continue; }

  const id = `custom_${slug}`;
  await c.query(
    `INSERT INTO "Product" (id,slug,name,description,origin,brand,"imageUrl",images,source,"minPriceCents",collections,"isActive","isFeatured","isFragile","isCustom",position,"categoryId","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,'Italy','Vallillo',$5,$6,'vallillo',NULL,ARRAY[]::text[],true,false,$7,true,0,'cat_oils-ghee',now(),now())`,
    [id, slug, label, desc, imgUrl, imgUrl ? [imgUrl] : [], fragile],
  );
  await c.query(
    `INSERT INTO "ProductVariant" (id,sku,name,"productId","retailPriceCents","inStock",position) VALUES ($1,$2,$3,$4,NULL,true,0)`,
    [`var_${slug}`, sku, size || "Each", id],
  );
  added++;
}
console.log(`\n${DRY ? "[DRY] would add" : "Added"} ${added} Vallillo olive oils.`);
await c.end();
