-- Reserve-and-pay orders are separate from credit sales. Products stay on hand
-- until a fully-paid order is explicitly handed over.
CREATE TYPE "LayawayStatus" AS ENUM ('ACTIVE', 'PAID_AWAITING_PICKUP', 'RELEASED', 'CANCELLED');
CREATE TYPE "LayawayPaymentMethod" AS ENUM ('CASH', 'BANK', 'CHEQUE', 'CARD');

ALTER TYPE "InvoiceType" ADD VALUE 'LAYAWAY';
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION';
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION_RELEASE';
ALTER TYPE "StockMovementType" ADD VALUE 'LAYAWAY_HANDOVER';

ALTER TABLE "Product" ADD COLUMN "quantityReserved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD CONSTRAINT "Product_reserved_nonnegative" CHECK ("quantityReserved" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_reserved_not_above_stock" CHECK ("quantityReserved" <= "quantityInStock");

CREATE TABLE "LayawayOrder" (
  "id" TEXT NOT NULL,
  "orderNumber" SERIAL NOT NULL,
  "status" "LayawayStatus" NOT NULL DEFAULT 'ACTIVE',
  "customerId" TEXT NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "collectedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "promisedPickupDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "releasedByUserId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "cancelReason" TEXT,
  "invoiceId" TEXT,
  CONSTRAINT "LayawayOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayawayItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "codeSnapshot" TEXT NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "costSnapshot" DECIMAL(12,2) NOT NULL,
  "qty" INTEGER NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "LayawayItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayawayPayment" (
  "id" TEXT NOT NULL,
  "receiptNumber" SERIAL NOT NULL,
  "orderId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "LayawayPaymentMethod" NOT NULL DEFAULT 'CASH',
  "reference" TEXT,
  "note" TEXT,
  "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LayawayPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LayawayOrder_orderNumber_key" ON "LayawayOrder"("orderNumber");
CREATE UNIQUE INDEX "LayawayOrder_invoiceId_key" ON "LayawayOrder"("invoiceId");
CREATE INDEX "LayawayOrder_customerId_status_idx" ON "LayawayOrder"("customerId", "status");
CREATE INDEX "LayawayOrder_status_createdAt_idx" ON "LayawayOrder"("status", "createdAt");
CREATE INDEX "LayawayItem_orderId_idx" ON "LayawayItem"("orderId");
CREATE INDEX "LayawayItem_productId_idx" ON "LayawayItem"("productId");
CREATE UNIQUE INDEX "LayawayPayment_receiptNumber_key" ON "LayawayPayment"("receiptNumber");
CREATE INDEX "LayawayPayment_orderId_paidDate_idx" ON "LayawayPayment"("orderId", "paidDate");
CREATE INDEX "LayawayPayment_createdAt_idx" ON "LayawayPayment"("createdAt");

ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LayawayItem" ADD CONSTRAINT "LayawayItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LayawayOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayItem" ADD CONSTRAINT "LayawayItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayPayment" ADD CONSTRAINT "LayawayPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LayawayOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayPayment" ADD CONSTRAINT "LayawayPayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
