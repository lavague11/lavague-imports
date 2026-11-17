-- Section M: invoicing — payments, delivery confirmation, in-app e-sign, public
-- customer links, and LV-#### numbering. Additive, idempotent.

-- New lifecycle fields on CustomerInvoice.
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "terms"          TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "poNumber"       TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "publicToken"    TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "sentAt"         TIMESTAMP(3);
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "deliveredAt"    TIMESTAMP(3);
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "deliveredBy"    TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "deliveryNote"   TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "signedAt"       TIMESTAMP(3);
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "signerName"     TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "signatureData"  TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "orderRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerInvoice_publicToken_key" ON "CustomerInvoice"("publicToken");
CREATE INDEX IF NOT EXISTS "CustomerInvoice_orderRequestId_idx" ON "CustomerInvoice"("orderRequestId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerInvoice_orderRequestId_fkey') THEN
    ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_orderRequestId_fkey"
      FOREIGN KEY ("orderRequestId") REFERENCES "OrderRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Payment method enum + payments table.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerPaymentMethod') THEN
    CREATE TYPE "CustomerPaymentMethod" AS ENUM ('CHECK','CASH','CARD','ACH','WIRE','OTHER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CustomerPayment" (
  "id"          TEXT PRIMARY KEY,
  "invoiceId"   TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL DEFAULT 0,
  "method"      "CustomerPaymentMethod" NOT NULL DEFAULT 'OTHER',
  "reference"   TEXT,
  "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedBy"  TEXT,
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomerPayment_invoiceId_idx" ON "CustomerPayment"("invoiceId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerPayment_invoiceId_fkey') THEN
    ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "CustomerInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Sequential number series (LV-#### invoices), seeded past any existing numbers.
CREATE TABLE IF NOT EXISTS "NumberSeries" (
  "key"   TEXT PRIMARY KEY,
  "value" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "NumberSeries" ("key","value")
VALUES ('invoice', (
  SELECT COALESCE(MAX(CAST(SUBSTRING("number" FROM 4) AS INTEGER)), 0)
  FROM "CustomerInvoice"
  WHERE "number" ~ '^LV-[0-9]+$'
))
ON CONFLICT ("key") DO NOTHING;
