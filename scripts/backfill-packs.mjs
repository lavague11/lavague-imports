// Parses product descriptions of the form "<amount><unit> X <caseQty>"
// (e.g. "500g X 12", "70 G X 24", "1L x 6") and fills the structured fields:
//   - variant size label  (e.g. "500 g")   -> ProductVariant.name  (single-variant only)
//   - units per case       (e.g. 12)        -> ProductVariant.unitsPerCase (all variants)
// It writes a durable ProductOverride.variantPacks so the values survive
// re-seeding, and applies them to the live rows.
//
// Dry run (no writes):  DRY=1 node scripts/backfill-packs.mjs
// Apply:                node scripts/backfill-packs.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const DRY = process.env.DRY === "1";

const UNIT_ALIASES = {
  g: "g", gram: "g", grams: "g", gr: "g", gm: "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", millilitre: "ml", milliliters: "ml", millilitres: "ml",
  l: "L", liter: "L", litre: "L", liters: "L", litres: "L", lt: "L",
  ct: "ct", count: "ct", pc: "ct", pcs: "ct", piece: "ct", pieces: "ct", pack: "ct",
};

// Whole trimmed description must be "<number><unit?> X <number>".
const RE = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{1,10})?\s*[x×*]\s*(\d+)\s*$/i;

function parse(desc) {
  if (!desc) return null;
  const m = RE.exec(desc.trim());
  if (!m) return null;
  const amount = m[1].replace(",", ".");
  const unitRaw = (m[2] ?? "").toLowerCase();
  const unit = unitRaw ? (UNIT_ALIASES[unitRaw] ?? null) : "";
  if (unit === null) return null; // had letters but not a unit we recognise → skip
  const caseQty = parseInt(m[3], 10);
  if (!Number.isFinite(caseQty) || caseQty <= 0) return null;
  const size = unit ? `${amount} ${unit}` : amount;
  return { size, unit, caseQty };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const products = await prisma.product.findMany({
    include: { variants: { orderBy: { position: "asc" } } },
  });

  let matched = 0;
  let single = 0;
  let multi = 0;
  const samples = [];

  for (const p of products) {
    const parsed = parse(p.description);
    if (!parsed) continue;
    matched++;
    const isSingle = p.variants.length === 1;
    if (isSingle) single++; else multi++;
    if (samples.length < 20) {
      samples.push(`${isSingle ? "1" : p.variants.length}v  "${p.description.trim()}" -> size=${parsed.size} case=${parsed.caseQty}  (${p.slug})`);
    }

    if (DRY) continue;

    const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, "");
    const packs = {};

    if (isSingle) {
      // The one variant gets both the size label and the case count.
      const v = p.variants[0];
      packs[v.sku] = { size: parsed.size, unitsPerCase: parsed.caseQty };
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { name: parsed.size, unitsPerCase: parsed.caseQty },
      });
    } else {
      // Multi-variant: only the variant whose existing size matches the
      // description's size gets the case count. Others are left untouched.
      const target = p.variants.find((v) => norm(v.name) === norm(parsed.size));
      if (!target) continue; // no reliable match → skip this product
      packs[target.sku] = { unitsPerCase: parsed.caseQty };
      await prisma.productVariant.update({
        where: { id: target.id },
        data: { unitsPerCase: parsed.caseQty },
      });
    }

    // Durable override so a re-seed re-applies it.
    await prisma.productOverride.upsert({
      where: { slug: p.slug },
      update: { variantPacks: packs },
      create: { slug: p.slug, variantPacks: packs },
    });
  }

  console.log(`\n${DRY ? "[DRY RUN] " : ""}scanned ${products.length} products`);
  console.log(`matched pattern: ${matched}  (single-variant: ${single}, multi-variant: ${multi})`);
  console.log("samples:");
  for (const s of samples) console.log("  " + s);
  if (DRY) console.log("\nNo changes written (DRY=1). Re-run without DRY to apply.");
  else console.log(`\nApplied packs to ${matched} products.`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
