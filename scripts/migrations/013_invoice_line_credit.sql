-- Credit lines on invoices: a credit is a line with isCredit=true, a reason, and a
-- negative lineTotalCents. Additive, idempotent. Reports can filter on isCredit.
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN IF NOT EXISTS "isCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN IF NOT EXISTS "creditReason" TEXT;
CREATE INDEX IF NOT EXISTS "CustomerInvoiceLine_isCredit_idx" ON "CustomerInvoiceLine"("isCredit");
