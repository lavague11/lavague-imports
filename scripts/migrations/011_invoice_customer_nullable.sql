-- Allow an invoice to start as a blank draft with no customer yet.
-- Customer gets assigned later from the editor. Additive, idempotent.
ALTER TABLE "CustomerInvoice" ALTER COLUMN "customerId" DROP NOT NULL;
