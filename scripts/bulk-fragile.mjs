// Bulk-marks breakable (glass) products fragile: olive oils (glass bottles, not
// tins/large jugs, and not "tuna in olive oil" etc.), vinegars, and drinks whose
// name is flagged "glass bottles". Durable via ProductOverride.isFragile.
//
// Dry run:  DRY=1 node scripts/bulk-fragile.mjs
// Apply:    node scripts/bulk-fragile.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const DRY = process.env.DRY === "1";

// Olive OIL as a bottled product — exclude foods packed "in olive oil" and soap.
const OIL = /olive oil/i;
const OIL_NOT = /tuna|fava|\bbean|soap|sardine|\bfish\b|anchov|tapenade|paste/i;
// Non-glass formats: 2L+ jugs, 2.8L, tins, cans, plastic.
const NON_GLASS = /\b([2-9]|1[0-9])(\.\d)?\s*l\b|2\.8\s*l|\btin\b|\bcan\b|plastic|\bjug\b|gallon/i;
const VINEGAR = /vinegar|vinaigre/i;
const GLASS_DRINK = /glass bottle/i;

function reason(name) {
  if (GLASS_DRINK.test(name)) return "glass-drink";
  if (VINEGAR.test(name)) return "vinegar";
  if (OIL.test(name) && !OIL_NOT.test(name) && !NON_GLASS.test(name)) return "olive-oil";
  return null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const products = await prisma.product.findMany({ select: { id: true, slug: true, name: true, isFragile: true } });
  const hits = [];
  for (const p of products) {
    const r = reason(p.name);
    if (r && !p.isFragile) hits.push({ ...p, reason: r });
  }

  const byReason = {};
  for (const h of hits) byReason[h.reason] = (byReason[h.reason] || 0) + 1;
  console.log(`${DRY ? "[DRY RUN] " : ""}${hits.length} products to mark fragile:`);
  console.log(Object.entries(byReason).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
  console.log("\nsamples:");
  for (const h of hits.slice(0, 30)) console.log(`  [${h.reason}] ${h.name}`);

  if (!DRY) {
    for (const h of hits) {
      await prisma.product.update({ where: { id: h.id }, data: { isFragile: true } });
      await prisma.productOverride.upsert({
        where: { slug: h.slug },
        update: { isFragile: true },
        create: { slug: h.slug, isFragile: true },
      });
    }
    console.log(`\nMarked ${hits.length} products fragile.`);
  } else {
    console.log("\nNo changes written (DRY=1).");
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
