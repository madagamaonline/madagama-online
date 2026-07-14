-- CreateEnum
CREATE TYPE "CustomerRequestType" AS ENUM ('PRODUCT_INQUIRY', 'IMPORT_REQUEST', 'PRICE_INQUIRY', 'OTHER');

-- Extend existing reminder types
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOMER_REQUEST';

-- CreateEnum
CREATE TYPE "CustomerRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "CustomerRequestStatus" AS ENUM ('NEW', 'SEARCHING', 'ORDERED', 'ARRIVED', 'CONTACTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomerRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CustomerRequestType" NOT NULL DEFAULT 'PRODUCT_INQUIRY',
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "budget" DECIMAL(12,2),
    "priority" "CustomerRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CustomerRequestStatus" NOT NULL DEFAULT 'NEW',
    "customerId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "productId" TEXT,
    "supplierId" TEXT,
    "assignedToUserId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "expectedArrivalDate" TIMESTAMP(3),
    "remindBySms" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "CustomerRequestStatus",
    "toStatus" "CustomerRequestStatus" NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRequest_requestNumber_key" ON "CustomerRequest"("requestNumber");
CREATE INDEX "CustomerRequest_status_followUpAt_idx" ON "CustomerRequest"("status", "followUpAt");
CREATE INDEX "CustomerRequest_assignedToUserId_status_idx" ON "CustomerRequest"("assignedToUserId", "status");
CREATE INDEX "CustomerRequest_customerId_idx" ON "CustomerRequest"("customerId");
CREATE INDEX "CustomerRequest_productId_idx" ON "CustomerRequest"("productId");
CREATE INDEX "CustomerRequestEvent_requestId_createdAt_idx" ON "CustomerRequestEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRequestEvent" ADD CONSTRAINT "CustomerRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerRequestEvent" ADD CONSTRAINT "CustomerRequestEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
