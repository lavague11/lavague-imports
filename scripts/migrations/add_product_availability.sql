-- DASHBOARD §1b: product availability (supplier-sourcing status, not a count). Additive, idempotent.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductAvailability') THEN
    CREATE TYPE "ProductAvailability" AS ENUM ('AVAILABLE','LIMITED','UNAVAILABLE');
  END IF;
END $$;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "availability" "ProductAvailability" NOT NULL DEFAULT 'AVAILABLE';
