-- Customer notes/log with a public/private flag. Additive, idempotent.

CREATE TABLE IF NOT EXISTS "CustomerNote" (
  "id"         TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "isPublic"   BOOLEAN NOT NULL DEFAULT false,
  "author"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomerNote_customerId_idx" ON "CustomerNote"("customerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerNote_customerId_fkey') THEN
    ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
