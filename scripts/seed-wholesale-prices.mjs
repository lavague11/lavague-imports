// Seeds a baseline wholesale price for every priced product: 30% below its
// retail price (the lowest variant / minPriceCents), rounded to a tidy number,
// and flips wholesaleEnabled on for those. msrpCents is set to the retail price
// as a reference. Quote-only products (no retail price) are left untouched — a
// wholesale price is quoted per account instead.
//
// This is a baseline, not final: per-account overrides and pricing tiers refine
// it later. Idempotent — safe to re-run (recomputes from the current retail).
// Override the discount with WHOLESALE_FACTOR (e.g. 0.65 = 35% off).
//
// Run: node scripts/seed-wholesale-prices.mjs
import "dotenv/config";
import pg from "pg";

const FACTOR = Number(process.env.WHOLESALE_FACTOR) || 0.7; // wholesale = retail * FACTOR

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// One set-based UPDATE. The CASE mirrors lib/pricing.ts tidyPrice(): under $20
// round to the nearest 10c then drop to x9; at/over $20 round to the dollar
// minus 1c. All money is integer cents.
const res = await c.query(
  `WITH calc AS (
     SELECT id, ROUND("minPriceCents" * $1::numeric) AS base
     FROM "Product"
     WHERE "minPriceCents" IS NOT NULL AND "minPriceCents" > 0
   )
   UPDATE "Product" p
   SET "wholesaleEnabled"   = true,
       "msrpCents"          = p."minPriceCents",
       "wholesalePriceCents" = CASE
         WHEN c.base < 2000 THEN (GREATEST(1, ROUND(c.base / 10.0))::int * 10) - 1
         ELSE (ROUND(c.base / 100.0)::int * 100) - 1
       END,
       "updatedAt" = now()
   FROM calc c
   WHERE p.id = c.id`,
  [FACTOR],
);

const [{ enabled, priced, total }] = (
  await c.query(
    `SELECT count(*) FILTER (WHERE "wholesaleEnabled") AS enabled,
            count(*) FILTER (WHERE "wholesalePriceCents" IS NOT NULL) AS priced,
            count(*) AS total
     FROM "Product"`,
  )
).rows;

const sample = (
  await c.query(
    `SELECT name, "minPriceCents" AS retail, "wholesalePriceCents" AS wholesale
     FROM "Product"
     WHERE "wholesalePriceCents" IS NOT NULL
     ORDER BY random() LIMIT 6`,
  )
).rows;

console.log(`Seeded wholesale prices (retail × ${FACTOR}) on ${res.rowCount} products.`);
console.log(`  wholesale-enabled: ${enabled} | with a wholesale price: ${priced} | catalog: ${total}`);
console.log("  sample:");
for (const s of sample) {
  console.log(`   ${s.name.slice(0, 44).padEnd(44)} retail $${(s.retail / 100).toFixed(2)} → wholesale $${(s.wholesale / 100).toFixed(2)}`);
}
await c.end();
