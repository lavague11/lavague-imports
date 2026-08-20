// Cleans pack codes out of ALL product names while capturing what they mean:
// the plain integer = units per case, the number+unit = item size. Only codes
// where one side carries a unit are touched (so "85 x 110" dimensions and
// "1 X 12" ambiguous counts are left alone). Also Title-Cases shouted runs.
// Dry run:  DRY=1 node scripts/clean-all-packs.mjs
// Apply:    node scripts/clean-all-packs.mjs
import "dotenv/config";
import pg from "pg";

const DRY = process.env.DRY === "1";
const U = "oz|ozs|lb|lbs|g|gr|grs|gm|kg|ml|l|lt|ltr|cl";
const OP = "[*/xX\\u00d7]";

const re3 = new RegExp(`(\\d+)\\s*${OP}\\s*(\\d+)\\s*${OP}\\s*(\\d+(?:\\.\\d+)?\\s*(?:${U}))\\b`, "i");
const reLead = new RegExp(`\\b(\\d+)\\s*${OP}\\s*(\\d+(?:\\.\\d+)?\\s*(?:${U}))\\b`, "i");
const reTrail = new RegExp(`\\b(\\d+(?:\\.\\d+)?\\s*(?:${U}))\\s*${OP}\\s*(\\d+)\\b`, "i");

function normSize(raw) {
  const m = /(\d+(?:\.\d+)?)\s*([a-z]+)/i.exec(raw);
  if (!m) return null;
  const n = m[1];
  const u = m[2].toLowerCase();
  const unit =
    u.startsWith("oz") ? "oz" :
    u.startsWith("lb") ? "lb" :
    u === "kg" ? "kg" :
    (u === "ml") ? "ml" :
    (u === "l" || u === "lt" || u === "ltr") ? "L" :
    u === "cl" ? "cl" :
    "g"; // g, gr, grs, gm
  return `${n} ${unit}`;
}

function smartTitle(s) {
  const words = s.split(/\s+/);
  const isCaps = (w) => /^[A-Z][A-Z'&./-]*$/.test(w) && /[A-Z]{2,}/.test(w);
  // title-case words that sit in a run of 2+ all-caps (shouted phrases)
  const out = words.map((w, i) => {
    const runNeighbour = isCaps(words[i - 1] ?? "") || isCaps(words[i + 1] ?? "");
    const longWord = w.replace(/[^A-Z]/g, "").length >= 5; // real word, not an acronym
    if (isCaps(w) && (runNeighbour || longWord)) return w[0] + w.slice(1).toLowerCase();
    return w;
  });
  return out
    .join(" ")
    .replace(/\bBbq\b/g, "BBQ").replace(/\bGnd\b/g, "Ground").replace(/\bEvo\b/g, "EVO")
    .replace(/\s{2,}/g, " ").trim();
}

function parsePack(name) {
  let s = name;
  let caseQty = null;
  let itemSize = null;
  let m;
  if ((m = re3.exec(s))) { caseQty = parseInt(m[2], 10); itemSize = normSize(m[3]); s = s.replace(m[0], " "); }
  else if ((m = reLead.exec(s))) { caseQty = parseInt(m[1], 10); itemSize = normSize(m[2]); s = s.replace(m[0], " "); }
  else if ((m = reTrail.exec(s))) { itemSize = normSize(m[1]); caseQty = parseInt(m[2], 10); s = s.replace(m[0], " "); }
  else return null; // no unit-bearing code → leave this product alone

  s = s.replace(/\(\s*\)/g, " ").replace(/\s*[-–—.,]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  s = smartTitle(s);
  return { cleanName: s, caseQty: Number.isFinite(caseQty) ? caseQty : null, itemSize };
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = await c.query(`SELECT id, slug, name FROM "Product" WHERE name ~ '[0-9] ?[*/xX] ?[0-9]' OR name LIKE '%×%' ORDER BY name`);

let changed = 0, skipped = 0;
const samples = [];
for (const p of rows.rows) {
  const r = parsePack(p.name);
  if (!r || !r.cleanName || r.cleanName === p.name) { skipped++; continue; }
  changed++;
  if (samples.length < 45) samples.push(`"${p.name}"\n   -> "${r.cleanName}"   [case=${r.caseQty ?? "-"} item=${r.itemSize ?? "-"}]`);

  if (!DRY) {
    // clean the display name (durable override)
    await c.query(`UPDATE "Product" SET name=$1 WHERE id=$2`, [r.cleanName, p.id]);
    // capture case + item on the variant(s)
    const vs = await c.query(`SELECT id, sku, name FROM "ProductVariant" WHERE "productId"=$1 ORDER BY position`, [p.id]);
    const single = vs.rows.length === 1;
    let target = vs.rows[0];
    if (!single && r.itemSize) {
      const norm = (x) => (x ?? "").toLowerCase().replace(/\s+/g, "");
      target = vs.rows.find((v) => norm(v.name) === norm(r.itemSize)) ?? null;
    }
    const packs = {};
    if (target) {
      const setName = single && r.itemSize ? r.itemSize : null;
      await c.query(`UPDATE "ProductVariant" SET "unitsPerCase"=COALESCE($1,"unitsPerCase")${setName ? ', name=$3' : ''} WHERE id=$2`,
        setName ? [r.caseQty, target.id, setName] : [r.caseQty, target.id]);
      packs[target.sku] = { ...(setName ? { size: setName } : {}), ...(r.caseQty ? { unitsPerCase: r.caseQty } : {}) };
    }
    await c.query(
      `INSERT INTO "ProductOverride" (id, slug, name, "variantPacks", "updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3::jsonb,now())
       ON CONFLICT (slug) DO UPDATE SET name=$2, "variantPacks"=COALESCE("ProductOverride"."variantPacks",'{}'::jsonb) || $3::jsonb, "updatedAt"=now()`,
      [p.slug, r.cleanName, JSON.stringify(packs)],
    );
  }
}

console.log(`${DRY ? "[DRY] " : ""}candidates: ${rows.rowCount}  ·  cleaned: ${changed}  ·  skipped (no unit / unchanged): ${skipped}\n`);
for (const s of samples) console.log("  " + s);
if (!DRY) console.log(`\nCleaned ${changed} names.`);
await c.end();
