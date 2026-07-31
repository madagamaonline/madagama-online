-- Warranty terms belong to individual products, because a single invoice may
-- contain products with different coverage periods.
ALTER TABLE "InvoiceItem" ADD COLUMN "warrantyMonths" INTEGER;
