-- Products created on the fly from an invoice photo/voice: hidden from the storefront
-- (isActive=false) and flagged for later review/approval. Additive, idempotent.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Product_needsReview_idx" ON "Product"("needsReview");
