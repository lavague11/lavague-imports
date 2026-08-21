// Imports Vallillo pasta shapes as custom Italy-origin products in
// Pasta & Couscous, and sets USD prices (converted from Vallillo's EUR
// figures) on the pasta AND the 8 previously-imported olive oils.
// Dry run: DRY=1 node scripts/import-vallillo-pasta.mjs
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const DRY = process.env.DRY === "1";
const RATE = 1.1681; // EUR -> USD, ECB 2026-08-20
const JSON_PATH = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/C--Users-La-Vague-Desktop-La-Vague-Imports/f44646aa-96cc-4c86-ab98-a05e3e2edd9b/scratchpad/vallillo.json";

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const usdCents = (eur) => Math.round(eur * RATE * 100);
const titleCase = (s) => s.replace(/\S+/g, (w) => (/^[A-Z0-9.]+$/.test(w) && w.length <= 5 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()));

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
const pasta = all.filter((p) => !/olio extra vergine|olive oil|gift box|taralli/i.test(p.name));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// 1) Price the 8 olive oils in USD (by size; plain + monocultivar share a price).
const oilEur = { "250ML": 11.5, "500ML": 17.9, "3L": 55.5, "5L": 85.0 };
for (const [sz, eur] of Object.entries(oilEur)) {
  const cents = usdCents(eur);
  console.log(`${DRY ? "[DRY] " : ""}oils ${sz}: €${eur} -> $${(cents / 100).toFixed(2)}`);
  if (!DRY) {
    await c.query(`UPDATE "ProductVariant" SET "retailPriceCents"=$1 WHERE sku LIKE $2`, [cents, `VAL-${sz}-%`]);
    await c.query(`UPDATE "Product" SET "minPriceCents"=$1 WHERE source='vallillo' AND id IN (SELECT "productId" FROM "ProductVariant" WHERE sku LIKE $2)`, [cents, `VAL-${sz}-%`]);
  }
}

// 2) Import pasta shapes.
let added = 0, i = 0;
for (const p of pasta) {
  i++;
  const label = `Vallillo ${titleCase(p.name)}`.replace(/\s{2,}/g, " ").trim();
  const slug = slugify(label);
  const cents = usdCents(p.prices.price / 100);
  const exists = await c.query(`SELECT 1 FROM "Product" WHERE slug=$1`, [slug]);
  if (exists.rowCount) { console.log(`skip (exists): ${label}`); continue; }
  const imgUrl = p.images && p.images[0] && p.images[0].src ? await storeImage(c, p.images[0].src) : null;
  console.log(`${DRY ? "[DRY] " : ""}+ ${label}  | $${(cents / 100).toFixed(2)} img=${imgUrl ? "y" : "n"}`);
  if (DRY) { added++; continue; }

  const id = `custom_${slug}`;
  const sku = `VAL-PST-${String(i).padStart(2, "0")}`;
  const desc = `Artisanal ${titleCase(p.name)} pasta from Vallillo, made in Italy. Imported direct.`;
  await c.query(
    `INSERT INTO "Product" (id,slug,name,description,origin,brand,"imageUrl",images,source,"minPriceCents",collections,"isActive","isFeatured","isFragile","isCustom",position,"categoryId","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,'Italy','Vallillo',$5,$6,'vallillo',$7,ARRAY[]::text[],true,false,false,true,0,'cat_pasta-couscous',now(),now())`,
    [id, slug, label, desc, imgUrl, imgUrl ? [imgUrl] : [], cents],
  );
  await c.query(
    `INSERT INTO "ProductVariant" (id,sku,name,"productId","retailPriceCents","inStock",position) VALUES ($1,$2,'Each',$3,$4,true,0)`,
    [`var_${slug}`, sku, id, cents],
  );
  added++;
}
console.log(`\n${DRY ? "[DRY] would add" : "Added"} ${added} pasta shapes; oils priced in USD @ ${RATE}.`);
await c.end();
