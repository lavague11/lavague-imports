// Section 11: fill the Product.brand column from product_name_mapping.xlsx
// (precompiled into scripts/migrations/brand_map.json). Precise and
// non-destructive: matches a product by any of its variant SKUs (then exact
// catalog name), and only sets brand where the product currently has none —
// never overwrites a hand-set brand, never guesses. Backs up every product's
// current (id, brand) first so the fill can be reverted.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const map = JSON.parse(readFileSync("scripts/migrations/brand_map.json", "utf8"));
const skuBrand = map.sku, nameBrand = map.name;

const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();

const prods = (await c.query(`SELECT p.id, p.name, p.brand, array_remove(array_agg(v.sku), NULL) skus FROM "Product" p LEFT JOIN "ProductVariant" v ON v."productId"=p.id GROUP BY p.id`)).rows;

// Full backup of current brands (revert = restore these).
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `scripts/migrations/backup_brands_${stamp}.json`;
writeFileSync(backupPath, JSON.stringify({ when: new Date().toISOString(), brands: prods.map((p) => ({ id: p.id, brand: p.brand })) }));

const updates = [];
for (const p of prods) {
  if (p.brand && p.brand.trim()) continue; // never overwrite an existing brand
  let brand = null;
  for (const s of p.skus) if (skuBrand[s]) { brand = skuBrand[s]; break; }
  if (!brand) brand = nameBrand[(p.name || "").toLowerCase()] ?? null;
  if (brand) updates.push({ id: p.id, brand });
}

for (const up of updates) {
  await c.query(`UPDATE "Product" SET brand=$1, "updatedAt"=now() WHERE id=$2 AND (brand IS NULL OR btrim(brand)='')`, [up.brand, up.id]);
}

const withBrand = (await c.query(`SELECT count(*) n FROM "Product" WHERE brand IS NOT NULL AND btrim(brand)<>''`)).rows[0].n;
const distinct = (await c.query(`SELECT count(DISTINCT brand) n FROM "Product" WHERE brand IS NOT NULL AND btrim(brand)<>''`)).rows[0].n;
await c.end();
console.log(JSON.stringify({ filled: updates.length, productsWithBrandNow: withBrand, distinctBrands: distinct, backup: backupPath }, null, 1));
