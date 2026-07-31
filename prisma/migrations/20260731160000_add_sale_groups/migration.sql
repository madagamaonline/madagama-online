-- One checkout may create separate taxable and non-taxable accounting invoices.
CREATE TABLE "SaleGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invoice" ADD COLUMN "saleGroupId" TEXT;

CREATE INDEX "SaleGroup_createdAt_idx" ON "SaleGroup"("createdAt");
CREATE INDEX "Invoice_saleGroupId_idx" ON "Invoice"("saleGroupId");

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_saleGroupId_fkey"
FOREIGN KEY ("saleGroupId") REFERENCES "SaleGroup"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
