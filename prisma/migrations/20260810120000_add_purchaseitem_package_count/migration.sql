-- The add_units_of_measure migration added "packageCount" to "InvoiceItem" instead
-- of "PurchaseItem". Add the column where the schema actually declares it.
ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "packageCount" INTEGER;
