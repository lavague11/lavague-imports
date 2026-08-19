// Generates professional product descriptions from each product's attributes
// (name, category, origin, size, units-per-case). Only rewrites LOW-QUALITY
// descriptions (pack codes, very short, or auto-generated boilerplate) and
// leaves genuinely written copy alone. Stores durable ProductOverride.description.
//
// Dry run (print samples, no writes):  DRY=1 node scripts/generate-descriptions.mjs
// Apply:                               node scripts/generate-descriptions.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const DRY = process.env.DRY === "1";

const PACK = /^\s*\d+(?:[.,]\d+)?\s*[a-zA-Z]{0,10}\s*[x×*]\s*\d+\s*$/i;

/** True when the existing description is boilerplate we should replace. */
function isLowQuality(d, name) {
  const t = (d || "").trim();
  if (!t) return true;
  if (PACK.test(t)) return true;
  if (t.length < 45) return true;
  if (/^[-–—]/.test(t)) return true; // "- Discover ...", "- Experience ..."
  if (/imported by la vague imports\.?$/i.test(t)) return true;
  if (/^(discover|experience|introducing|enjoy|try)\b/i.test(t)) return true;
  if (t.replace(/[.\s]/g, "").toLowerCase() === (name || "").replace(/[.\s]/g, "").toLowerCase()) return true;
  return false;
}

const CAT = {
  "Bakery & Bread": { noun: "bakery staple", adj: "freshly baked", use: "breakfast and everyday meals" },
  "Beverages & Water": { noun: "beverage", adj: "refreshing", use: "refreshment any time of day" },
  "Body & Home Care": { noun: "everyday essential", adj: "quality", use: "daily care at home" },
  "Canned & Jarred": { noun: "pantry staple", adj: "ready-to-use", use: "quick, flavorful meals" },
  "Dairy & Cheese": { noun: "dairy product", adj: "fresh", use: "breakfast boards and cooking" },
  "Fish & Seafood": { noun: "seafood", adj: "carefully selected", use: "quick meals and mezze" },
  "Flour & Baking": { noun: "baking essential", adj: "finely milled", use: "baking and home cooking" },
  "Frozen": { noun: "frozen specialty", adj: "freshly frozen", use: "easy home cooking" },
  "Honey, Jams & Spreads": { noun: "spread", adj: "naturally sweet", use: "breakfast and baking" },
  "Kitchen & Tools": { noun: "kitchen essential", adj: "practical", use: "everyday kitchen tasks" },
  "Meat & Poultry": { noun: "cut", adj: "premium", use: "hearty, flavorful meals" },
  "Nuts, Seeds & Dates": { noun: "snack", adj: "wholesome", use: "snacking and cooking" },
  "Oils & Ghee": { noun: "oil", adj: "premium", use: "cooking and finishing dishes" },
  "Olives & Pickles": { noun: "olives", adj: "brine-cured", use: "mezze platters and everyday snacking" },
  "Pantry & Grocery": { noun: "pantry staple", adj: "everyday", use: "your pantry" },
  "Pasta & Couscous": { noun: "pantry staple", adj: "authentic", use: "quick, satisfying meals" },
  "Rice, Grains & Beans": { noun: "grain", adj: "wholesome", use: "everyday cooking" },
  "Spices & Herbs": { noun: "spice", adj: "aromatic", use: "seasoning your favourite recipes" },
  "Sweets & Snacks": { noun: "treat", adj: "indulgent", use: "snacking and sharing" },
};
const DEFAULT_CAT = { noun: "specialty", adj: "quality", use: "everyday enjoyment" };

/** Tidy a messy product name into a phrase suitable for a sentence. */
function cleanName(name) {
  let s = name || "";
  s = s.replace(/\s*[-–—]\s*\$\s*[\d.]+\s*\/?\s*(lb|kg|oz|ea|each)?\.?\s*$/i, ""); // "- $6.99/lb"
  s = s.replace(/\s*\d+(?:\.\d+)?\s*[a-z]{0,4}\s*[x*×]\s*\d+\s*$/i, ""); // trailing "2l*12", "130g x 20"
  s = s.replace(/\s+[x×]\s*\d+\s*$/i, ""); // trailing "X 52"
  s = s.replace(/\s*\(\s*\d+(?:\.\d+)?\s*[a-z]{1,4}\s*\)\s*$/i, ""); // trailing "(125 g)"
  s = s.replace(/\s*\b\d+(?:\.\d+)?\s*(g|kg|ml|l|lb|oz)\b\.?\s*$/i, ""); // trailing "70 g"
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || name;
}

function firstUnitSize(variants) {
  // Prefer a variant name that reads like a size (has a unit).
  for (const v of variants) {
    if (/\d/.test(v.name) && /[a-zA-Z]/.test(v.name) && !/^each$/i.test(v.name)) return v.name;
  }
  return null;
}

function buildDescription(p) {
  const meta = CAT[p.category] ?? DEFAULT_CAT;
  const clean = cleanName(p.name);
  const article = /^[aeiou]/i.test(meta.adj) ? "an" : "a";
  const cap = article[0].toUpperCase() + article.slice(1);

  const hash = [...(p.slug || "")].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const openers = [
    `${clean} is ${article} ${meta.adj} ${meta.noun}.`,
    `${cap} ${meta.adj} ${meta.noun}, ${clean} is a welcome addition to your home.`,
    `Add ${clean} to your order — ${article} ${meta.adj} ${meta.noun} worth keeping on hand.`,
  ];
  const opener = openers[hash % openers.length];

  const size = firstUnitSize(p.variants);
  const caseQty = p.variants.map((v) => v.unitsPerCase).find((n) => n && n > 0) || null;
  let pack = "";
  if (size && caseQty) pack = `Packaged in ${size} units and available by the case of ${caseQty} for wholesale orders.`;
  else if (size) pack = `Packaged in ${size} units.`;
  else if (caseQty) pack = `Available by the case of ${caseQty} for wholesale orders.`;

  const flourish = (hash % 2 === 0 ? `Perfect for ${meta.use}.` : `A dependable choice for ${meta.use}.`);

  return [opener, pack, flourish].filter(Boolean).join(" ");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const products = await prisma.product.findMany({
    include: { category: true, variants: { orderBy: { position: "asc" } } },
  });

  let rewrite = 0;
  let kept = 0;
  const samples = [];

  for (const p of products) {
    const row = { ...p, category: p.category.name };
    if (!isLowQuality(p.description, p.name)) { kept++; continue; }
    rewrite++;
    const desc = buildDescription(row);
    if (samples.length < 24 && rewrite % 11 === 0) {
      samples.push(`[${row.category}] ${p.name}\n     OLD: ${JSON.stringify((p.description || "").slice(0, 60))}\n     NEW: ${desc}`);
    }
    if (DRY) continue;
    await prisma.product.update({ where: { id: p.id }, data: { description: desc } });
    await prisma.productOverride.upsert({
      where: { slug: p.slug },
      update: { description: desc },
      create: { slug: p.slug, description: desc },
    });
  }

  console.log(`\n${DRY ? "[DRY RUN] " : ""}products: ${products.length}`);
  console.log(`rewrite (low quality): ${rewrite}   keep (already good): ${kept}`);
  console.log("\n-- sample rewrites --");
  for (const s of samples) console.log("\n  " + s);
  if (DRY) console.log("\nNo changes written (DRY=1).");
  else console.log(`\nRewrote ${rewrite} descriptions.`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
