// Turns the parsed QUWAIZI Yemen Collection (data-import/yemen-products.json,
// produced by scripts/parse-yemen.py) into catalog.yemen.json. All items are
// Yemeni, quote-only (no public price), imported by La Vague.
//
// Run: python scripts/parse-yemen.py && node scripts/import-yemen.mjs
import fs from "node:fs";

const IN = "data-import/yemen-products.json";
const OUT = "src/lib/catalog/catalog.yemen.json";

function slugify(s) {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "item"
  );
}

// Units per case from a pack string: multiply the count multipliers, ignoring
// the per-unit size. "100 g x 48 pcs" → 48; "8 x 12 x 30 g" → 96; "30 lb x 1" → 1.
function unitsPerCaseFromSize(size) {
  const tokens = size.split(/\s*[x×]\s*/i).map((t) => t.trim()).filter(Boolean);
  const counts = [];
  for (const tok of tokens) {
    if (/\b(g|gr|kg|ml|l|cl|oz|lb|lbs|kilo)\b/i.test(tok)) continue; // a per-unit size
    const m = tok.match(/^(\d+(?:\.\d+)?)(?:\s*pcs?)?$/i);
    if (m) counts.push(parseFloat(m[1]));
  }
  if (counts.length === 0) return null;
  const total = counts.reduce((a, b) => a * b, 1);
  return Number.isInteger(total) && total > 1 ? total : total > 1 ? Math.round(total) : null;
}

const rows = JSON.parse(fs.readFileSync(IN, "utf8"));
const usedSlugs = new Set();
const usedSkus = new Set();
const products = [];

for (const r of rows) {
  const name = r.name.replace(/\s+/g, " ").trim();
  if (!name) continue;

  let slug = slugify(name);
  let s = slug, n = 2;
  while (usedSlugs.has(s)) s = `${slug}-${n++}`;
  slug = s; usedSlugs.add(slug);

  let sku = (r.sku || "").trim() || `YEM-${slug}`.toUpperCase().slice(0, 40);
  let sk = sku, k = 2;
  while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
  sku = sk; usedSkus.add(sku);

  const size = (r.size || "").trim();
  products.push({
    source: "yemen",
    id: "yem_" + slug,
    slug,
    name,
    tagline: null,
    description: size
      ? `${name} — Yemeni import from La Vague's Yemen Collection. Pack size: ${size}.`
      : `${name} — Yemeni import from La Vague's Yemen Collection.`,
    origin: "Yemen",
    brand: null,
    imageUrl: null,
    ribbon: null,
    isFeatured: false,
    collections: r.category ? [r.category] : [],
    variants: [
      {
        id: "yem_var_" + slug,
        sku,
        name: "Each",
        retailPriceCents: null,
        compareAtPriceCents: null,
        unitsPerCase: unitsPerCaseFromSize(size),
        minOrderCases: null,
        inStock: true,
      },
    ],
  });
}

fs.writeFileSync(OUT, JSON.stringify({ products }, null, 2));
const withCase = products.filter((p) => p.variants[0].unitsPerCase != null).length;
console.log("Wrote", OUT);
console.log("  products:", products.length, "| with case size:", withCase, "| all origin Yemen, quote-only");
const cats = {};
for (const p of products) for (const c of p.collections) cats[c] = (cats[c] || 0) + 1;
console.log("  categories:");
Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log("   ", String(v).padStart(4), k));
