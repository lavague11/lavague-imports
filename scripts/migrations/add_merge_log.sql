-- PRODUCTS_UI §17: merge audit + undo. Additive, idempotent.
CREATE TABLE IF NOT EXISTS "MergeLog" (
  "id" TEXT PRIMARY KEY,
  "survivorSlug" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "undoneAt" TIMESTAMP(3)
);
