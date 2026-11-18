-- Backup before the Safa I261009672 correction.
DROP TABLE IF EXISTS "CustomerPayment_bak_safa";
CREATE TABLE "CustomerPayment_bak_safa" AS SELECT * FROM "CustomerPayment";
DROP TABLE IF EXISTS "CustomerInvoice_bak_safa";
CREATE TABLE "CustomerInvoice_bak_safa" AS SELECT * FROM "CustomerInvoice";
DROP TABLE IF EXISTS "CustomerInvoiceLine_bak_safa";
CREATE TABLE "CustomerInvoiceLine_bak_safa" AS SELECT * FROM "CustomerInvoiceLine";
