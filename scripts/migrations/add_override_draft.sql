-- PRODUCTS_UI §9: draft layer on ProductOverride. Additive and idempotent.
ALTER TABLE "ProductOverride" ADD COLUMN IF NOT EXISTS "draft" JSONB;
ALTER TABLE "ProductOverride" ADD COLUMN IF NOT EXISTS "draftUpdatedAt" TIMESTAMP(3);
