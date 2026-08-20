// Pre-generates cached JPEG thumbnails for every product image so the PDF
// catalog builds fast. Idempotent — already-cached images are skipped.
// Run: npm run warm:thumbs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { getThumb } from "../src/lib/thumbs.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const rows = await prisma.product.findMany({
  where: { isActive: true, imageUrl: { not: null } },
  select: { imageUrl: true },
});
const urls = [...new Set(rows.map((r) => r.imageUrl).filter(Boolean))];
console.log("images to warm:", urls.length);

let done = 0;
let ok = 0;
let i = 0;
const CONC = 8;
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (i < urls.length) {
      const url = urls[i++];
      const t = await getThumb(url, prisma);
      if (t) ok++;
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${urls.length} (${ok} cached)`);
    }
  }),
);
console.log(`done: ${ok}/${urls.length} thumbnails cached`);
await prisma.$disconnect();
