-- Soft-archive flag for invoices (bulk archive). Additive, idempotent.
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "CustomerInvoice_archived_idx" ON "CustomerInvoice"("archived");
