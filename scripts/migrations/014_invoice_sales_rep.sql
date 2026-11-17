-- Sales rep on an invoice (replaces the PO number field in the editor). Additive.
ALTER TABLE "CustomerInvoice" ADD COLUMN IF NOT EXISTS "salesRep" TEXT;
