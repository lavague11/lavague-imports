-- Section I + wholesale import: business details + admin fields on Customer.
-- Additive, idempotent.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone"        TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "address"      TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes"        TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "blocked"      BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Customer_role_idx" ON "Customer"("role");
