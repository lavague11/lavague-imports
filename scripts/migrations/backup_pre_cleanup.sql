-- Backup before the invoice cleanup (deletions, due dates, etc.).
DROP TABLE IF EXISTS "CustomerInvoice_bak_cleanup";
CREATE TABLE "CustomerInvoice_bak_cleanup" AS SELECT * FROM "CustomerInvoice";
DROP TABLE IF EXISTS "CustomerInvoiceLine_bak_cleanup";
CREATE TABLE "CustomerInvoiceLine_bak_cleanup" AS SELECT * FROM "CustomerInvoiceLine";
DROP TABLE IF EXISTS "CustomerPayment_bak_cleanup";
CREATE TABLE "CustomerPayment_bak_cleanup" AS SELECT * FROM "CustomerPayment";
