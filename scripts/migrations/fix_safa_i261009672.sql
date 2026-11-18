-- Safa I261009672 final fix (per owner):
-- 1) "Credit For Maha" line was +$20, should be -$20 credit -> invoice total $2,128.
UPDATE "CustomerInvoiceLine"
SET "unitPriceCents" = -2000, "lineTotalCents" = -2000, "isCredit" = true, "creditReason" = 'Credit For Maha'
WHERE id = '446d0c5c-08a9-45b8-8213-be9dd17fb935';

-- 2) Delete the duplicate $2,128 CASH payment (11/11/2026) — no cash came in.
DELETE FROM "CustomerPayment" WHERE id = '9b68ed5d-4d64-43eb-b5e0-11331073eb78';

-- 3) Check #6410 was actually $2,128.00 (per check photo), not $2,168.
UPDATE "CustomerPayment" SET "amountCents" = 212800 WHERE id = 'e97efa6c-b91a-4008-abf5-a1044cd5ac58';

-- 4) Recompute invoice: subtotal $2,148 (non-credit lines), total $2,128, paid $2,128, Paid.
UPDATE "CustomerInvoice"
SET "subtotalCents" = 214800, "totalCents" = 212800, "paidCents" = 212800, status = 'PAID', "updatedAt" = now()
WHERE "externalNumber" = 'I261009672';
