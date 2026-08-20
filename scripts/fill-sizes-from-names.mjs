// Fills the item-size field from a size token in the product name (e.g.
// "(125 g)", "16 Oz", "500 ml") for products whose variant size is still "Each".
// Non-destructive: only sets the size field, never changes the name, never
// overwrites an existing real size. Dry run: DRY=1 node scripts/fill-sizes-from-names.mjs
import "dotenv/config";
import pg from "pg";

const DRY = process.env.DRY === "1";
const SIZE = /(\d+(?:\.\d+)?)\s*(oz|ozs|g|gr|grs|gm|kg|ml|l|lt|ltr|lb|lbs)\b/i;

function normUnit(u) {
  u = u.toLowerCase();
  if (u.startsWith("oz")) return "oz";
  if (u.startsWith("lb")) return "lb";
  if (u === "kg") return "kg";
  if (u === "ml") return "ml";
  if (u === "l" || u === "lt" || u === "ltr") return "L";
  return "g";
}

function sizeFromName(name) {
  // prefer a parenthetical size, else the first size token
  const paren = name.match(/\(([^)]*?\d+(?:\.\d+)?\s*(?:oz|ozs|g|gr|grs|gm|kg|ml|l|lt|ltr|lb|lbs)\b[^)]*)\)/i);
  const src = paren ? paren[1] : name;
  const m = SIZE.exec(src);
  if (!m) return null;
  return `${m[1]} ${normUnit(m[2])}`;
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = await c.query(`
  SELECT DISTINCT ON (p.id) p.id, p.slug, p.name, var.id vid, var.sku, var.name size, (SELECT count(*) FROM "ProductVariant" v2 WHERE v2."productId"=p.id) vcount
  FROM "Product" p JOIN "ProductVariant" var ON var."productId"=p.id
  WHERE p."isActive"=true
  ORDER BY p.id, var.position`);

let changed = 0;
const samples = [];
for (const p of rows.rows) {
  if (p.vcount > 1) continue; // single-variant only
  if (p.size && !/^(each|chaque|unit)$/i.test(p.size) && p.size.trim() !== "") continue; // already sized
  const size = sizeFromName(p.name);
  if (!size) continue;
  changed++;
  if (samples.length < 30) samples.push(`"${p.name}"  ->  size ${size}`);
  if (!DRY) {
    await c.query(`UPDATE "ProductVariant" SET name=$1 WHERE id=$2`, [size, p.vid]);
    await c.query(
      `INSERT INTO "ProductOverride" (id, slug, "variantPacks", "updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2::jsonb,now())
       ON CONFLICT (slug) DO UPDATE SET "variantPacks"=COALESCE("ProductOverride"."variantPacks",'{}'::jsonb) || $2::jsonb, "updatedAt"=now()`,
      [p.slug, JSON.stringify({ [p.sku]: { size } })],
    );
  }
}
console.log(`${DRY ? "[DRY] " : ""}filled item size for ${changed} products\n`);
for (const s of samples) console.log("  " + s);
if (!DRY) console.log(`\nUpdated ${changed}.`);
await c.end();
