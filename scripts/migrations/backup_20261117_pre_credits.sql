-- Safety backup before the credits feature (Stage B). Non-destructive dated copies.
CREATE TABLE IF NOT EXISTS "CustomerInvoice_backup_20261117" AS SELECT * FROM "CustomerInvoice";
CREATE TABLE IF NOT EXISTS "CustomerInvoiceLine_backup_20261117" AS SELECT * FROM "CustomerInvoiceLine";
CREATE TABLE IF NOT EXISTS "Customer_backup_20261117" AS SELECT * FROM "Customer";
