// Adds the media/pack columns (Product.images, ProductOverride.images,
// ProductOverride.variantPacks) to an existing database. Idempotent.
// Run: npm run db:migrate:media
import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const statements = [
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`,
  `ALTER TABLE "ProductOverride" ADD COLUMN IF NOT EXISTS "images" JSONB;`,
  `ALTER TABLE "ProductOverride" ADD COLUMN IF NOT EXISTS "variantPacks" JSONB;`,
  `CREATE TABLE IF NOT EXISTS "MediaAsset" (
     "id" TEXT PRIMARY KEY,
     "contentType" TEXT NOT NULL,
     "data" BYTEA NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
];

const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const sql of statements) {
    await client.query(sql);
    console.log("ok:", sql);
  }
  console.log("Media migration applied.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
