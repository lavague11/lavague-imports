-- Delete the two empty drafts and the leftover test duplicate LV-0011
-- (I261117680, El Zaeem, no payments — duplicate of the real paid LV-0012).
-- Lines cascade on invoice delete.
DELETE FROM "CustomerInvoice" WHERE number IN ('LV-0009','LV-0010','LV-0011');
