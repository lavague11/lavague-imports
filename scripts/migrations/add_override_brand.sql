-- PRODUCTS_UI §15: make hand-set brand durable against re-imports. Additive.
ALTER TABLE "ProductOverride" ADD COLUMN IF NOT EXISTS "brand" TEXT;
