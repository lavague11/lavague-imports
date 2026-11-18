-- HalalCo I261007669: correct 2 unit prices + add the dropped "Costco's" (couscous)
-- credit, so the total equals Invoice ASAP's $18,989.00 exactly.
UPDATE "CustomerInvoiceLine" SET "unitPriceCents"=14000, "lineTotalCents"=210000
 WHERE id='5d8791ac-4501-459c-a0f7-1c98d93042b6';  -- Dahmiss 41022 500x20: $150 -> $140
UPDATE "CustomerInvoiceLine" SET "unitPriceCents"=15000, "lineTotalCents"=225000
 WHERE id='dd85e902-16d9-4b87-8fad-3e59ee2fcf98';  -- Dahmiss Tea 50x200g: $152 -> $150

-- Add the missing -$99 credit as a real credit line (NOT matched to a product).
INSERT INTO "CustomerInvoiceLine"
 (id,"invoiceId",description,quantity,"unitPriceCents","lineTotalCents","isCredit","creditReason","originalName")
VALUES (gen_random_uuid()::text,
 (SELECT id FROM "CustomerInvoice" WHERE "externalNumber"='I261007669'),
 'Credit For The Costco''s 3 Case Cases', 1, -9900, -9900, true, 'Couscous credit', 'Credit For The Costco''s 3 Case Cases');

-- Recompute totals: subtotal $19,088 (non-credit), credit $99, total $18,989.
UPDATE "CustomerInvoice" SET "subtotalCents"=1908800, "totalCents"=1898900, "updatedAt"=now()
 WHERE "externalNumber"='I261007669';
