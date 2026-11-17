-- Structured address fields on Customer + Customer-based invoices. Additive, idempotent.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "street"  TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "unit"    TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "city"    TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "state"   TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "zip"     TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lat"     DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lng"     DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "placeId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerInvoiceStatus') THEN
    CREATE TYPE "CustomerInvoiceStatus" AS ENUM ('DRAFT','SENT','PARTIAL','PAID','VOID');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CustomerInvoice" (
  "id"            TEXT PRIMARY KEY,
  "number"        TEXT NOT NULL,
  "customerId"    TEXT NOT NULL,
  "status"        "CustomerInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "issueDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate"       TIMESTAMP(3),
  "subtotalCents" INTEGER NOT NULL DEFAULT 0,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "shippingCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents"      INTEGER NOT NULL DEFAULT 0,
  "totalCents"    INTEGER NOT NULL DEFAULT 0,
  "paidCents"     INTEGER NOT NULL DEFAULT 0,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerInvoice_number_key" ON "CustomerInvoice"("number");
CREATE INDEX IF NOT EXISTS "CustomerInvoice_customerId_idx" ON "CustomerInvoice"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerInvoice_status_idx" ON "CustomerInvoice"("status");

CREATE TABLE IF NOT EXISTS "CustomerInvoiceLine" (
  "id"             TEXT PRIMARY KEY,
  "invoiceId"      TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "quantity"       INTEGER NOT NULL DEFAULT 1,
  "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
  "lineTotalCents" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "CustomerInvoiceLine_invoiceId_idx" ON "CustomerInvoiceLine"("invoiceId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerInvoice_customerId_fkey') THEN
    ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerInvoiceLine_invoiceId_fkey') THEN
    ALTER TABLE "CustomerInvoiceLine" ADD CONSTRAINT "CustomerInvoiceLine_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "CustomerInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
