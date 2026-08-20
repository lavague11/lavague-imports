// Handles the remaining count-style pack codes ("1 X 12", "1 x 24 x 12",
// "100 x 24", "4 x 18") that carry no unit: units-per-case is captured and the
// code stripped. Guards against ratios ("80/20"), can sizes ("4/4") — those use
// "/" and are ignored — decimals and big-by-big pairs (dimensions like 85 x 110).
// Dry run:  DRY=1 node scripts/clean-count-packs.mjs
// Apply:    node scripts/clean-count-packs.mjs
import "dotenv/config";
import pg from "pg";

const DRY = process.env.DRY === "1";

function smartTitle(s) {
  const words = s.split(/\s+/);
  const isCaps = (w) => /^[A-Z][A-Z'&./-]*$/.test(w) && /[A-Z]{2,}/.test(w);
  return words
    .map((w, i) => {
      const run = isCaps(words[i - 1] ?? "") || isCaps(words[i + 1] ?? "");
      const long = w.replace(/[^A-Z]/g, "").length >= 5;
      return isCaps(w) && (run || long) ? w[0] + w.slice(1).toLowerCase() : w;
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parse(name) {
  // an "x"-separated run of numbers (never "/", so ratios/can-sizes are safe)
  const m = /\b\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)+\b/i.exec(name);
  if (!m) return null;
  const seg = m[0];
  if (/\d\.\d/.test(seg)) return null; // decimals → dimensions
  const nums = seg.split(/\s*[x×]\s*/i).map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  if (nums.length === 2 && nums[0] >= 40 && nums[1] >= 40) return null; // dimensions

  let caseQty = null;
  let itemCt = null;
  if (nums[0] === 1) caseQty = nums.slice(1).reduce((a, b) => a * b, 1);
  else if (nums.length === 2) { itemCt = nums[0]; caseQty = nums[1]; }
  else caseQty = nums.reduce((a, b) => a * b, 1);

  let clean = name.replace(seg, " ").replace(/\s{2,}/g, " ").replace(/\s*[.,]\s*$/, "").trim();
  clean = smartTitle(clean);
  return { clean, caseQty: caseQty && caseQty > 0 ? caseQty : null, itemCt: itemCt && itemCt > 1 ? itemCt : null };
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = await c.query(`SELECT id, slug, name FROM "Product" WHERE name ~ '[0-9] ?[xX] ?[0-9]' ORDER BY name`);

let changed = 0;
const kept = [];
for (const p of rows.rows) {
  const r = parse(p.name);
  if (!r || !r.clean || r.clean === p.name) { kept.push(p.name); continue; }
  changed++;
  console.log(`"${p.name}"\n   -> "${r.clean}"   [case=${r.caseQty ?? "-"}${r.itemCt ? ` itemCt=${r.itemCt}` : ""}]`);
  if (!DRY) {
    await c.query(`UPDATE "Product" SET name=$1 WHERE id=$2`, [r.clean, p.id]);
    const vs = await c.query(`SELECT id, sku FROM "ProductVariant" WHERE "productId"=$1 ORDER BY position`, [p.id]);
    const single = vs.rows.length === 1;
    const target = vs.rows[0];
    const packs = {};
    if (target) {
      const setName = single && r.itemCt ? `${r.itemCt} ct` : null;
      await c.query(`UPDATE "ProductVariant" SET "unitsPerCase"=COALESCE($1,"unitsPerCase")${setName ? ", name=$3" : ""} WHERE id=$2`,
        setName ? [r.caseQty, target.id, setName] : [r.caseQty, target.id]);
      packs[target.sku] = { ...(setName ? { size: setName } : {}), ...(r.caseQty ? { unitsPerCase: r.caseQty } : {}) };
    }
    await c.query(
      `INSERT INTO "ProductOverride" (id, slug, name, "variantPacks", "updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3::jsonb,now())
       ON CONFLICT (slug) DO UPDATE SET name=$2, "variantPacks"=COALESCE("ProductOverride"."variantPacks",'{}'::jsonb) || $3::jsonb, "updatedAt"=now()`,
      [p.slug, r.clean, JSON.stringify(packs)],
    );
  }
}
console.log(`\n${DRY ? "[DRY] " : ""}cleaned ${changed}. left untouched (${kept.length}): ${kept.join(" | ")}`);
await c.end();
