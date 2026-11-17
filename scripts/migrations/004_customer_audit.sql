-- Section I detail/edit: admin change log for customers. Additive, idempotent.
CREATE TABLE IF NOT EXISTS "CustomerAudit" (
  "id"         TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "actor"      TEXT NOT NULL,
  "summary"    TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomerAudit_customerId_idx" ON "CustomerAudit"("customerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerAudit_customerId_fkey') THEN
    ALTER TABLE "CustomerAudit" ADD CONSTRAINT "CustomerAudit_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
