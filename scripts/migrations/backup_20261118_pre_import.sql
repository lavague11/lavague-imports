-- Backup before the Invoice ASAP history import (2026-11-18). Re-runnable.
-- Snapshots the four tables the import touches into dated copies.
DROP TABLE IF EXISTS "Customer_bak_20261118";
CREATE TABLE "Customer_bak_20261118" AS SELECT * FROM "Customer";
DROP TABLE IF EXISTS "Product_bak_20261118";
CREATE TABLE "Product_bak_20261118" AS SELECT * FROM "Product";
DROP TABLE IF EXISTS "CustomerInvoice_bak_20261118";
CREATE TABLE "CustomerInvoice_bak_20261118" AS SELECT * FROM "CustomerInvoice";
DROP TABLE IF EXISTS "CustomerInvoiceLine_bak_20261118";
CREATE TABLE "CustomerInvoiceLine_bak_20261118" AS SELECT * FROM "CustomerInvoiceLine";
