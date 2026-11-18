-- PRODUCTS_UI §15: imported-value snapshot + import suggestions. Additive, idempotent.
ALTER TABLE "ProductOverride" ADD COLUMN IF NOT EXISTS "imported" JSONB;
ALTER TABLE "ProductOverride" ADD COLUMN IF NOT EXISTS "importSuggests" JSONB;
