-- Invoice photos — proof-of-delivery / payment / other images attached to an
-- invoice. Bytes reuse MediaAsset (served at /media/<id>). Additive, idempotent.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoicePhotoKind') THEN
    CREATE TYPE "InvoicePhotoKind" AS ENUM ('DELIVERY','PAYMENT','OTHER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "InvoicePhoto" (
  "id"         TEXT PRIMARY KEY,
  "invoiceId"  TEXT NOT NULL,
  "url"        TEXT NOT NULL,
  "kind"       "InvoicePhotoKind" NOT NULL DEFAULT 'OTHER',
  "label"      TEXT,
  "uploadedBy" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InvoicePhoto_invoiceId_idx" ON "InvoicePhoto"("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoicePhoto_kind_idx" ON "InvoicePhoto"("kind");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoicePhoto_invoiceId_fkey') THEN
    ALTER TABLE "InvoicePhoto" ADD CONSTRAINT "InvoicePhoto_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "CustomerInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
