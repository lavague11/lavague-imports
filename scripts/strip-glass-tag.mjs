// Strips the "⚠️ Glass bottles ⚠️ (See description...)" tag (and the warning
// emoji) from product names — it's redundant now that fragile items carry a
// proper badge. Cuts from the first warning sign (U+26A0) to the end of the
// name. Durable via ProductOverride.name.
//
// Dry run:  DRY=1 node scripts/strip-glass-tag.mjs
// Apply:    node scripts/strip-glass-tag.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const DRY = process.env.DRY === "1";
const TAG = /\s*⚠[\s\S]*$/; // from the ⚠ warning sign to end

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const products = await prisma.product.findMany({ select: { id: true, slug: true, name: true } });
  const changes = [];
  for (const p of products) {
    if (!/glass bottle/i.test(p.name) && !/⚠/.test(p.name)) continue;
    const cleaned = p.name.replace(TAG, "").trim();
    if (cleaned && cleaned !== p.name) changes.push({ ...p, cleaned });
  }

  console.log(`${DRY ? "[DRY RUN] " : ""}${changes.length} names to clean:`);
  for (const ch of changes.slice(0, 40)) console.log(`  "${ch.name}"\n    -> "${ch.cleaned}"`);

  if (!DRY) {
    for (const ch of changes) {
      await prisma.product.update({ where: { id: ch.id }, data: { name: ch.cleaned } });
      await prisma.productOverride.upsert({
        where: { slug: ch.slug },
        update: { name: ch.cleaned },
        create: { slug: ch.slug, name: ch.cleaned },
      });
    }
    console.log(`\nCleaned ${changes.length} names.`);
  } else {
    console.log("\nNo changes written (DRY=1).");
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
