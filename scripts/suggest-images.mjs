// Best-effort image suggestions for products missing a photo. Queries DuckDuckGo
// image search by product name and stores the top candidate in
// ProductOverride.suggestedImageUrl (never applied automatically — the admin
// approves it in the edit form). Expect a meaningful share to be wrong.
//
// Run: npm run images:suggest        (optionally LIMIT=50)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0" };

async function ddgImage(query) {
  // DuckDuckGo needs a per-session token (vqd) from the HTML page first.
  const page = await (await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images`, { headers: UA })).text();
  const vqd = page.match(/vqd=["']?([\d-]+)["']?/)?.[1] || page.match(/vqd=([^&"']+)/)?.[1];
  if (!vqd) return null;
  const url = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,&p=1`;
  const res = await fetch(url, { headers: { ...UA, Referer: "https://duckduckgo.com/" } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const first = data?.results?.find((r) => r.image && /^https?:\/\//.test(r.image));
  return first?.image ?? null;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const limit = Number(process.env.LIMIT) || 0;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const products = await prisma.product.findMany({
  where: { imageUrl: null, isActive: true },
  select: { slug: true, name: true, brand: true },
  ...(limit ? { take: limit } : {}),
});
console.log(`Suggesting images for ${products.length} products without a photo…`);

let found = 0;
for (const [i, p] of products.entries()) {
  const query = [p.brand, p.name].filter(Boolean).join(" ");
  let img = null;
  try {
    img = await ddgImage(query);
  } catch {
    /* skip */
  }
  if (img) {
    await prisma.productOverride.upsert({
      where: { slug: p.slug },
      update: { suggestedImageUrl: img },
      create: { slug: p.slug, suggestedImageUrl: img },
    });
    found += 1;
  }
  if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${products.length} (${found} suggested)`);
  await sleep(1200); // be polite
}

console.log(`Done: ${found} suggestions stored. Review & approve them in the admin edit form.`);
await prisma.$disconnect();
