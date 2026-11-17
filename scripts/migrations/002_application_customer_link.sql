-- Section E: link wholesale applications to customer accounts + decision metadata.
-- Additive, idempotent.
ALTER TABLE "WholesaleApplication" ADD COLUMN IF NOT EXISTS "customerId"   TEXT;
ALTER TABLE "WholesaleApplication" ADD COLUMN IF NOT EXISTS "decisionNote" TEXT;
ALTER TABLE "WholesaleApplication" ADD COLUMN IF NOT EXISTS "reviewedAt"   TIMESTAMP(3);
ALTER TABLE "WholesaleApplication" ADD COLUMN IF NOT EXISTS "reviewedBy"   TEXT;

CREATE INDEX IF NOT EXISTS "WholesaleApplication_customerId_idx" ON "WholesaleApplication"("customerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WholesaleApplication_customerId_fkey') THEN
    ALTER TABLE "WholesaleApplication" ADD CONSTRAINT "WholesaleApplication_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
