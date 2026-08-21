// Detects Noura imports that duplicate existing (non-Noura) catalog products.
// Reports two buckets: EXACT (same product name AND same size -> true dup, safe
// to remove) and NAME-ONLY (same product, different size -> legit variant, kept).
// Read-only by default. Delete the exact dups with: APPLY=1 node scripts/noura-dedup.mjs
import "dotenv/config";
import pg from "pg";

const APPLY = process.env.APPLY === "1";

const STOP = new Set(["with", "and", "the", "of", "in", "style", "flavor", "flavors", "assorted", "pack", "box", "boxes", "sticks", "pieces", "pcs", "pc", "vacuum", "jar", "can", "tin", "bottle", "sachet", "sachets", "net", "wt", "each", "x"]);
const UNIT = /^\d+([.,]\d+)?\s*(g|gr|kg|ml|l|cl|oz|lb|lbs|pcs|pieces|pc|kilo|kilos)?$/i;

function tokens(name) {
  return [...new Set(
    name.toLowerCase()
      .replace(/[×x]\s*\d+/g, " ")
      .replace(/[^a-z0-9%]+/g, " ")
      .split(/\s+/)
      .filter((t) => t && t.length > 1 && !STOP.has(t) && !UNIT.test(t) && !/^\d+$/.test(t)),
  )];
}
function sizeKey(name, variantSize) {
  const src = `${variantSize || ""} ${name}`.toLowerCase().replace(",", ".");
  const m = src.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l|oz|lb|lbs|pcs|pc|pieces)\b/);
  if (!m) return "";
  let n = parseFloat(m[1]);
  let u = m[2].replace("gr", "g").replace("lbs", "lb").replace(/pc|pieces/, "pcs");
  if (u === "kg") { n *= 1000; u = "g"; }
  if (u === "l") { n *= 1000; u = "ml"; }
  if (u === "cl") { n *= 10; u = "ml"; }
  return `${n}${u}`;
}
const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = (await c.query(`
  SELECT p.id, p.slug, p.name, p.source,
         (SELECT array_agg(name ORDER BY position) FROM "ProductVariant" WHERE "productId"=p.id) AS vsizes,
         cat.name AS cat
  FROM "Product" p
  JOIN "Category" cat ON cat.id=p."categoryId"
  WHERE p."isActive"=true`)).rows;

const prep = (r) => {
  const sizes = [...new Set((r.vsizes || []).map((v) => sizeKey(r.name, v)).filter(Boolean))];
  if (sizes.length === 0) { const s = sizeKey(r.name, ""); if (s) sizes.push(s); }
  return { ...r, tk: tokens(r.name), szSet: new Set(sizes), sz: sizes[0] || "" };
};
const existing = rows.filter((r) => r.source !== "noura").map(prep);
const noura = rows.filter((r) => r.source === "noura").map(prep);

const exact = [], nameOnly = [], review = [];
for (const n of noura) {
  let best = null, bestScore = 0;
  for (const e of existing) {
    if (n.tk.length === 0) break;
    const s = jaccard(n.tk, e.tk);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  if (!best) continue;
  if (bestScore >= 0.72) {
    const sameSize = n.sz && best.szSet.has(n.sz);
    (sameSize ? exact : nameOnly).push({ n, best, s: bestScore, sameSize });
  } else if (bestScore >= 0.4) {
    review.push({ n, best, s: bestScore });
  }
}

console.log(`noura=${noura.length}  existing=${existing.length}`);
console.log(`\n=== EXACT duplicates (same name+size) : ${exact.length} ===`);
for (const d of exact) console.log(`  DUP  "${d.n.name}" [${d.n.sz}]  ==  [${d.best.source}] "${d.best.name}" sizes={${(d.best.vsizes || []).join(", ")}} (${(d.s * 100) | 0}%)`);
console.log(`\n=== SAME product, NEW size (kept as variants) : ${nameOnly.length} ===`);
for (const d of nameOnly) console.log(`  ~    "${d.n.name}" [${d.n.sz || "?"}]  ~~  "${d.best.name}" {${(d.best.vsizes || []).join(", ")}} (${(d.s * 100) | 0}%)`);
console.log(`\n=== POSSIBLY same family — NEEDS YOUR REVIEW : ${review.length} ===`);
for (const d of review.sort((a, b) => b.s - a.s)) console.log(`  ?    "${d.n.name}" [${d.n.sz || "?"}]  vs  [${d.best.source}] "${d.best.name}" {${(d.best.vsizes || []).join(", ")}} (${(d.s * 100) | 0}%)`);

if (APPLY && exact.length) {
  for (const d of exact) {
    await c.query(`DELETE FROM "ProductVariant" WHERE "productId"=$1`, [d.n.id]);
    await c.query(`DELETE FROM "Product" WHERE id=$1`, [d.n.id]);
  }
  console.log(`\nDELETED ${exact.length} exact-duplicate Noura products.`);
} else if (exact.length) {
  console.log(`\n(dry run — re-run with APPLY=1 to delete the ${exact.length} exact dups)`);
}
await c.end();
