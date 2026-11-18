-- PRODUCTS_UI §17: remember "Not duplicates" groups. Additive, idempotent.
CREATE TABLE IF NOT EXISTS "ProductDuplicateDismissal" (
  "key" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
