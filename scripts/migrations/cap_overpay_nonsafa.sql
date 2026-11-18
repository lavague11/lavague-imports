-- Cap the 9 non-Safa overpayments at invoice total (balance $0, Paid). Per the
-- owner: El Zaeem's $840 is the "Hussein" credit line already on the invoice,
-- Bakkal is one duplicate check on two invoices, the rest are small / run into
-- El Zaeem's tab. Safa's $2,128 is the only real overpayment (handled separately).
UPDATE "CustomerInvoice"
SET "paidCents" = "totalCents", status = 'PAID', "updatedAt" = now()
WHERE "externalNumber" IN
 ('I260425647','I200815179','I200727175','I211120292','I220131302','I260526655','I250214551','I210421232','I200422123')
 AND "paidCents" > "totalCents";
