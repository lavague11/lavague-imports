-- Barcode (EAN-13 / UPC) on products, for scan-to-find and scan-to-create.
-- Additive, idempotent.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
CREATE INDEX IF NOT EXISTS "Product_barcode_idx" ON "Product"("barcode");
