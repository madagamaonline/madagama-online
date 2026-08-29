-- Supplier-wise sales require a stable supplier attribution on each sale line.
-- This migration is additive only: no existing column or row is removed.
CREATE TYPE "SupplierAttribution" AS ENUM ('CAPTURED', 'LEGACY_INFERRED');

ALTER TABLE "InvoiceItem"
  ADD COLUMN "supplierAtSaleId" TEXT,
  ADD COLUMN "supplierNameSnapshot" TEXT,
  ADD COLUMN "supplierAttribution" "SupplierAttribution";

-- Existing invoice lines predate supplier snapshots. Freeze the current primary
-- supplier as an explicitly inferred value so old reports remain useful without
-- pretending the attribution was captured at the original sale.
UPDATE "InvoiceItem" AS item
SET
  "supplierAtSaleId" = product."primarySupplierId",
  "supplierNameSnapshot" = supplier."name",
  "supplierAttribution" = 'LEGACY_INFERRED'
FROM "Product" AS product
LEFT JOIN "Supplier" AS supplier ON supplier."id" = product."primarySupplierId"
WHERE item."productId" = product."id"
  AND product."primarySupplierId" IS NOT NULL;

CREATE INDEX "InvoiceItem_supplierAtSaleId_idx" ON "InvoiceItem"("supplierAtSaleId");

ALTER TABLE "InvoiceItem"
ADD CONSTRAINT "InvoiceItem_supplierAtSaleId_fkey"
FOREIGN KEY ("supplierAtSaleId") REFERENCES "Supplier"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
