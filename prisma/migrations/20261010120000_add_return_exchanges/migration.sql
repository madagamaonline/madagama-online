-- Additive only: links an exchange return to the checkout it paid towards, and
-- records whether each returned item went back into sellable stock. Existing
-- rows keep their meaning (no exchange link; items were restocked).
ALTER TABLE "SalesReturn" ADD COLUMN "exchangeSaleGroupId" TEXT;
ALTER TABLE "SalesReturnItem" ADD COLUMN "restocked" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "SalesReturn_exchangeSaleGroupId_idx" ON "SalesReturn"("exchangeSaleGroupId");

ALTER TABLE "SalesReturn"
ADD CONSTRAINT "SalesReturn_exchangeSaleGroupId_fkey"
FOREIGN KEY ("exchangeSaleGroupId") REFERENCES "SaleGroup"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
