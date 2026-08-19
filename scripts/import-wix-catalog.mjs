// Imports the Wix catalog export into a clean catalog.json the app + seed read.
// Run: node scripts/import-wix-catalog.mjs
import fs from "node:fs";
import path from "node:path";

const CSV = "data-import/wix-catalog.csv";
const OUT = "src/lib/catalog/catalog.wix.json";
const WIX_MEDIA_BASE = "https://static.wixstatic.com/media/";

/* ---- CSV parsing (quotes, commas, embedded newlines) ---- */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        f += c;
      }
    } else if (c === '"') {
      q = true;
    } else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\r") {
      // skip
    } else if (c === "\n") {
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else {
      f += c;
    }
  }
  if (f.length || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

/* ---- curated categories, in priority order for primary assignment ---- */
const CURATED = [
  { slug: "olive-oil", name: "Olive Oil", description: "Single-origin olive oil, including the El Ouazzania range from Morocco.", match: ["Olive Oil El Ouazzania", "Olive Oil", "Oil"] },
  { slug: "olives", name: "Olives", description: "Cured olives and Morocolives by the jar, tin, and case.", match: ["Morocolives", "Olives"] },
  { slug: "spices-herbs", name: "Spices & Herbs", description: "Retail and Marrakesh spices, herb blends, and seasoning.", match: ["Retail Spices, Marrakesh Spices", "Marrakesh Spices", "Retail Spices", "Herbs & Spices", "Sauces Spice & Herbs"] },
  { slug: "teas", name: "Teas", description: "Green tea, mint, and regional tea blends.", match: ["Teas"] },
  { slug: "sweets-biscuits", name: "Biscuits & Sweets", description: "Biscuits, confections, jams, custards, and spreads.", match: ["Biscuits & Sweets", "Jams El Baraka", "Custards (4 Portions)", "Custards (1 Portion)"] },
  { slug: "pantry", name: "Couscous, Pasta & Pantry", description: "Couscous, semolina, pasta, broths, and pastry preparations.", match: ["Couscous & Pasta", "Semolina", "Broth & Soups Ideal", "Pastry Preparation", "Sauces & Harissa & Vinegar"] },
  { slug: "fish", name: "Sardines & Tuna", description: "Tinned sardines, tuna, and preserved fish.", match: ["Sardines & Tuna"] },
  { slug: "drinks", name: "Drinks", description: "Sodas, waters, and regional soft drinks.", match: ["Drinks"] },
  { slug: "body-home", name: "Body & Home Care", description: "Body care, soaps, laundry, and household goods.", match: ["Body Care", "Laundry soap", "COCO Noura Charcoal"] },
  { slug: "kitchen", name: "Kitchen & Tools", description: "Kitchenware, utensils, and serving items.", match: ["Kitchen items"] },
];
const FALLBACK = { slug: "specialty", name: "Specialty & Other", description: "Imported specialty goods across the range." };
// Generic buckets that should never define a product's primary category.
const GENERIC = new Set(["Wholesale Orders", "Best Sellers", "ECOM", "Others", "TAYEB Brand", "Leader"]);

/* ---- helpers ---- */
function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "item"
  );
}
function cleanHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}
function resolveImage(raw) {
  if (!raw) return null;
  const first = raw.split(/[;,]/)[0].trim();
  if (!first) return null;
  if (/^https?:\/\//i.test(first)) return first;
  return WIX_MEDIA_BASE + first;
}
function normName(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
function primaryCategory(collections) {
  for (const cat of CURATED) {
    if (collections.some((c) => cat.match.includes(c))) return cat;
  }
  return FALLBACK;
}

/* ---- run ---- */
const raw = fs.readFileSync(CSV, "utf8").replace(/^﻿/, "");
const rows = parseCSV(raw);
const header = rows[0];
const H = Object.fromEntries(header.map((h, i) => [h, i]));
const get = (r, name) => (r[H[name]] ?? "").trim();
const dataRows = rows.slice(1).filter((r) => r.length > 1 && get(r, "fieldType") === "Product");

// Dedupe by normalized name, merging collections and keeping the best fields.
const byName = new Map();
let order = 0;
for (const r of dataRows) {
  if (get(r, "visible").toLowerCase() !== "true") continue;
  const name = get(r, "name");
  if (!name) continue;
  const key = normName(name);
  const collections = get(r, "collection").split(";").map((s) => s.trim()).filter(Boolean);
  const priceNum = parseFloat(get(r, "price"));
  const priceCents = !isNaN(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null;
  const record = {
    name,
    sku: get(r, "sku"),
    priceCents,
    image: resolveImage(get(r, "productImageUrl")),
    ribbon: get(r, "ribbon") || null,
    description: cleanHtml(get(r, "description")),
    brand: get(r, "brand") || null,
    inStock: get(r, "inventory").toLowerCase() !== "outofstock",
    collections,
    order: order++,
  };
  const existing = byName.get(key);
  if (!existing) {
    byName.set(key, record);
    continue;
  }
  existing.collections = [...new Set([...existing.collections, ...collections])];
  if (existing.priceCents == null && record.priceCents != null) existing.priceCents = record.priceCents;
  else if (record.priceCents != null && existing.priceCents != null) existing.priceCents = Math.max(existing.priceCents, record.priceCents);
  if (!existing.sku && record.sku) existing.sku = record.sku;
  if (!existing.image && record.image) existing.image = record.image;
  if (!existing.ribbon && record.ribbon) existing.ribbon = record.ribbon;
  if (record.description.length > existing.description.length) existing.description = record.description;
  if (!existing.brand && record.brand) existing.brand = record.brand;
}

const merged = [...byName.values()].sort((a, b) => a.order - b.order);

const usedCats = new Map();
const usedSlugs = new Set();
const usedSkus = new Set();
const products = [];

for (const m of merged) {
  const cat = primaryCategory(m.collections);
  if (!usedCats.has(cat.slug)) usedCats.set(cat.slug, cat);

  let slug = slugify(m.name);
  let s = slug;
  let n = 2;
  while (usedSlugs.has(s)) s = `${slug}-${n++}`;
  slug = s;
  usedSlugs.add(slug);

  let sku = m.sku || `LV-${slug}`.toUpperCase().slice(0, 32);
  let sk = sku;
  let k = 2;
  while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
  sku = sk;
  usedSkus.add(sku);

  products.push({
    id: "prod_" + slug,
    slug,
    name: m.name,
    tagline: null,
    description: m.description || `${m.name} — imported by La Vague Imports.`,
    origin: null,
    brand: m.brand,
    imageUrl: m.image,
    ribbon: m.ribbon,
    isFeatured: m.collections.includes("Best Sellers"),
    categorySlug: cat.slug,
    categoryName: cat.name,
    collections: m.collections,
    variants: [
      {
        id: "var_" + slug,
        sku,
        name: "Each",
        retailPriceCents: m.priceCents,
        compareAtPriceCents: null,
        unitsPerCase: null,
        minOrderCases: null,
        inStock: m.inStock,
      },
    ],
  });
}

const catOrder = [...CURATED, FALLBACK].map((c) => c.slug);
const categories = [...usedCats.values()]
  .sort((a, b) => catOrder.indexOf(a.slug) - catOrder.indexOf(b.slug))
  .map((c) => ({ id: "cat_" + c.slug, slug: c.slug, name: c.name, description: c.description }));

const allCollections = new Map();
for (const p of products)
  for (const c of p.collections) {
    if (GENERIC.has(c)) continue;
    allCollections.set(c, (allCollections.get(c) || 0) + 1);
  }
const collections = [...allCollections.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, slug: slugify(name), count }));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ categories, collections, products }, null, 2));

const priced = products.filter((p) => p.variants[0].retailPriceCents != null).length;
const withImg = products.filter((p) => p.imageUrl).length;
const featured = products.filter((p) => p.isFeatured).length;
console.log("Wrote", OUT);
console.log("  categories:", categories.length, "| collection filters:", collections.length);
console.log("  products:", products.length, "| priced:", priced, "| with image:", withImg, "| featured:", featured);
console.log("  category spread:");
for (const c of categories) console.log("   ", products.filter((p) => p.categorySlug === c.slug).length, "\t", c.name);
