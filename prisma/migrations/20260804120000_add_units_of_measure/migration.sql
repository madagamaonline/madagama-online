-- Stock is canonical: EACH for piece products and METER for length products.
CREATE TYPE "InventoryTracking" AS ENUM ('PIECE', 'LENGTH');
CREATE TYPE "UnitOfMeasure" AS ENUM ('EACH', 'METER', 'CENTIMETER', 'MILLIMETER', 'FOOT', 'INCH');

ALTER TABLE "Product"
  ADD COLUMN "trackingType" "InventoryTracking" NOT NULL DEFAULT 'PIECE',
  ADD COLUMN "defaultUnit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ALTER COLUMN "quantityInStock" TYPE DECIMAL(16,4) USING "quantityInStock"::DECIMAL(16,4),
  ALTER COLUMN "quantityInStock" SET DEFAULT 0,
  ALTER COLUMN "quantityReserved" TYPE DECIMAL(16,4) USING "quantityReserved"::DECIMAL(16,4),
  ALTER COLUMN "quantityReserved" SET DEFAULT 0,
  ALTER COLUMN "reorderLevel" TYPE DECIMAL(16,4) USING "reorderLevel"::DECIMAL(16,4),
  ALTER COLUMN "reorderLevel" SET DEFAULT 0;

ALTER TABLE "InvoiceItem"
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ADD COLUMN "enteredQty" DECIMAL(16,4),
  ADD COLUMN "enteredUnit" "UnitOfMeasure",
  ADD COLUMN "packageCount" INTEGER,
  ALTER COLUMN "qty" TYPE DECIMAL(16,4) USING "qty"::DECIMAL(16,4);

ALTER TABLE "PurchaseItem"
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ADD COLUMN "enteredQty" DECIMAL(16,4),
  ADD COLUMN "enteredUnit" "UnitOfMeasure",
  ALTER COLUMN "qty" TYPE DECIMAL(16,4) USING "qty"::DECIMAL(16,4);

ALTER TABLE "QuotationItem"
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ADD COLUMN "enteredQty" DECIMAL(16,4),
  ADD COLUMN "enteredUnit" "UnitOfMeasure",
  ALTER COLUMN "qty" TYPE DECIMAL(16,4) USING "qty"::DECIMAL(16,4),
  ALTER COLUMN "qty" SET DEFAULT 1;

ALTER TABLE "LayawayItem"
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ADD COLUMN "enteredQty" DECIMAL(16,4),
  ADD COLUMN "enteredUnit" "UnitOfMeasure",
  ALTER COLUMN "qty" TYPE DECIMAL(16,4) USING "qty"::DECIMAL(16,4);

ALTER TABLE "SalesReturnItem"
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ALTER COLUMN "qty" TYPE DECIMAL(16,4) USING "qty"::DECIMAL(16,4);

ALTER TABLE "SupplierReturnItem"
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ALTER COLUMN "qty" TYPE DECIMAL(16,4) USING "qty"::DECIMAL(16,4);

ALTER TABLE "StockMovement"
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
  ALTER COLUMN "qty" TYPE DECIMAL(16,4) USING "qty"::DECIMAL(16,4),
  ALTER COLUMN "balanceAfter" TYPE DECIMAL(16,4) USING "balanceAfter"::DECIMAL(16,4);
