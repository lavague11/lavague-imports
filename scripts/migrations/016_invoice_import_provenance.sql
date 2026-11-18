-- Invoice ASAP history import: provenance columns. Additive + idempotent.
-- CustomerInvoice: external reference, original invoice date, import source.
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "externalNumber" TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3);
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "source" TEXT;
-- Unique so re-running the import upserts on externalNumber (NULLs stay distinct).
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerInvoice_externalNumber_key" ON "CustomerInvoice" ("externalNumber");

-- CustomerInvoiceLine: keep the raw Invoice ASAP fields alongside description.
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN IF NOT EXISTS "itemCode" TEXT;
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN IF NOT EXISTS "originalName" TEXT;
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN IF NOT EXISTS "cleanName" TEXT;
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN IF NOT EXISTS "brand" TEXT;
