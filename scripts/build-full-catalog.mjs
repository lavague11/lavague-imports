// Pre-builds the complete catalog PDF (both sort modes) and stores it in
// CatalogCache so the unfiltered download is served instantly. Re-run after
// catalog changes. Run: npm run build:catalog
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { generateCatalog } from "../src/lib/build-catalog.ts";

const MAX = 3000; // pre-built offline, so include the whole active range

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

for (const sortMode of ["country", "category"]) {
  const started = Date.now();
  const result = await generateCatalog(prisma, { sortMode, max: MAX });
  if (!result) {
    console.log(`${sortMode}: no products`);
    continue;
  }
  await prisma.catalogCache.upsert({
    where: { key: `full-${sortMode}` },
    create: { key: `full-${sortMode}`, data: Uint8Array.from(result.pdf), count: result.count },
    update: { data: Uint8Array.from(result.pdf), count: result.count, builtAt: new Date() },
  });
  console.log(`full-${sortMode}: ${result.count} products, ${(result.pdf.length / 1024 / 1024).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

await prisma.$disconnect();
