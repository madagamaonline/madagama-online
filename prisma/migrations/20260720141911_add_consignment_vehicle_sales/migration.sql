-- CreateEnum
CREATE TYPE "VehicleKind" AS ENUM ('TRACTOR', 'HARVESTER', 'COMBINE_HARVESTER');

-- CreateEnum
CREATE TYPE "ConsignmentVehicleStatus" AS ENUM ('DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'RETURNED');

-- CreateEnum
CREATE TYPE "VehicleSaleType" AS ENUM ('CASH', 'EXTERNAL_FINANCE', 'IN_HOUSE_CREDIT');

-- CreateEnum
CREATE TYPE "VehicleSaleStatus" AS ENUM ('CONFIRMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "VehiclePaymentKind" AS ENUM ('FULL_PAYMENT', 'DOWN_PAYMENT', 'INSTALLMENT', 'FINAL_SETTLEMENT');

-- CreateEnum
CREATE TYPE "VehiclePaymentMethod" AS ENUM ('CASH', 'BANK', 'CHEQUE', 'CARD');

-- CreateEnum
CREATE TYPE "VehicleCreditStatus" AS ENUM ('ACTIVE', 'SETTLED', 'DEFAULTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "VehicleDocumentCaseStatus" AS ENUM ('AWAITING_CUSTOMER_DOCUMENTS', 'DOCUMENTS_RECEIVED', 'SUBMITTED', 'PROCESSING', 'REGISTERED', 'HANDED_OVER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VehicleDocumentItemStatus" AS ENUM ('REQUIRED', 'RECEIVED', 'SUBMITTED', 'APPROVED', 'RETURNED', 'WAIVED');

-- CreateEnum
CREATE TYPE "VehicleDocumentEventType" AS ENUM ('CASE_CREATED', 'DOCUMENT_ADDED', 'STATUS_CHANGED', 'CUSTOMER_DOCUMENTS_RECEIVED', 'REGISTRATION_DOCUMENTS_HANDED_OVER', 'NOTE');

-- CreateEnum
CREATE TYPE "VehicleAcknowledgementType" AS ENUM ('CUSTOMER_DOCUMENTS_RECEIVED', 'REGISTRATION_DOCUMENTS_HANDED_OVER');

-- CreateTable
CREATE TABLE "ConsignmentVehicle" (
    "id" TEXT NOT NULL,
    "vehicleNumber" SERIAL NOT NULL,
    "kind" "VehicleKind" NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "colour" TEXT,
    "engineNumber" TEXT NOT NULL,
    "chassisNumber" TEXT NOT NULL,
    "specifications" TEXT,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supplierId" TEXT NOT NULL,
    "supplierReference" TEXT,
    "listPrice" DECIMAL(12,2) NOT NULL,
    "supplierSettlementDue" DECIMAL(12,2) NOT NULL,
    "status" "ConsignmentVehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsignmentVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSale" (
    "id" TEXT NOT NULL,
    "saleNumber" SERIAL NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "soldByEmployeeId" TEXT,
    "type" "VehicleSaleType" NOT NULL,
    "status" "VehicleSaleStatus" NOT NULL DEFAULT 'CONFIRMED',
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleLabelSnapshot" TEXT NOT NULL,
    "engineNumberSnapshot" TEXT NOT NULL,
    "chassisNumberSnapshot" TEXT NOT NULL,
    "supplierNameSnapshot" TEXT NOT NULL,
    "listPrice" DECIMAL(12,2) NOT NULL,
    "supplierSettlementDue" DECIMAL(12,2) NOT NULL,
    "grossDealerCommission" DECIMAL(12,2) NOT NULL,
    "customerDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "customerPrice" DECIMAL(12,2) NOT NULL,
    "netDealerCommission" DECIMAL(12,2) NOT NULL,
    "customerCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "supplierPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lossOverrideReason" TEXT,
    "financeProvider" TEXT,
    "financeReference" TEXT,
    "financeApprovedAmount" DECIMAL(12,2),
    "financeApprovedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedByUserId" TEXT,

    CONSTRAINT "VehicleSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCustomerPayment" (
    "id" TEXT NOT NULL,
    "receiptNumber" SERIAL NOT NULL,
    "saleId" TEXT NOT NULL,
    "kind" "VehiclePaymentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "VehiclePaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "note" TEXT,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleCustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCreditAgreement" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "firstDueDate" TIMESTAMP(3),
    "termMonths" INTEGER,
    "expectedInstallment" DECIMAL(12,2),
    "interestRatePerMonth" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "interestFreeMonths" INTEGER NOT NULL DEFAULT 0,
    "guarantorName" TEXT,
    "guarantorNic" TEXT,
    "guarantorPhone" TEXT,
    "status" "VehicleCreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleCreditAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSupplierSettlement" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "VehiclePaymentMethod" NOT NULL DEFAULT 'BANK',
    "reference" TEXT,
    "note" TEXT,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleSupplierSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDocumentCase" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "status" "VehicleDocumentCaseStatus" NOT NULL DEFAULT 'AWAITING_CUSTOMER_DOCUMENTS',
    "registrationNumber" TEXT,
    "processingReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "handedOverAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDocumentCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDocumentItem" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "VehicleDocumentItemStatus" NOT NULL DEFAULT 'REQUIRED',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "fileKey" TEXT,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "waiverReason" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDocumentEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "VehicleDocumentEventType" NOT NULL,
    "fromStatus" "VehicleDocumentCaseStatus",
    "toStatus" "VehicleDocumentCaseStatus",
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDocumentAcknowledgement" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "VehicleAcknowledgementType" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerNic" TEXT NOT NULL,
    "signatureKey" TEXT NOT NULL,
    "acknowledgementText" TEXT NOT NULL,
    "documentManifest" JSONB NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "witnessedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleDocumentAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentVehicle_vehicleNumber_key" ON "ConsignmentVehicle"("vehicleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentVehicle_engineNumber_key" ON "ConsignmentVehicle"("engineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentVehicle_chassisNumber_key" ON "ConsignmentVehicle"("chassisNumber");

-- CreateIndex
CREATE INDEX "ConsignmentVehicle_supplierId_status_idx" ON "ConsignmentVehicle"("supplierId", "status");

-- CreateIndex
CREATE INDEX "ConsignmentVehicle_status_receivedAt_idx" ON "ConsignmentVehicle"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleSale_saleNumber_key" ON "VehicleSale"("saleNumber");

-- A vehicle can have an old audited void, but never two live sales.
CREATE UNIQUE INDEX "VehicleSale_one_live_sale_per_vehicle"
ON "VehicleSale" ("vehicleId")
WHERE "status" <> 'VOIDED';

-- CreateIndex
CREATE INDEX "VehicleSale_vehicleId_status_idx" ON "VehicleSale"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "VehicleSale_customerId_saleDate_idx" ON "VehicleSale"("customerId", "saleDate");

-- CreateIndex
CREATE INDEX "VehicleSale_type_status_idx" ON "VehicleSale"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCustomerPayment_receiptNumber_key" ON "VehicleCustomerPayment"("receiptNumber");

-- CreateIndex
CREATE INDEX "VehicleCustomerPayment_saleId_paidDate_idx" ON "VehicleCustomerPayment"("saleId", "paidDate");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCreditAgreement_saleId_key" ON "VehicleCreditAgreement"("saleId");

-- CreateIndex
CREATE INDEX "VehicleCreditAgreement_status_firstDueDate_idx" ON "VehicleCreditAgreement"("status", "firstDueDate");

-- CreateIndex
CREATE INDEX "VehicleSupplierSettlement_saleId_paidDate_idx" ON "VehicleSupplierSettlement"("saleId", "paidDate");

-- CreateIndex
CREATE INDEX "VehicleSupplierSettlement_supplierId_paidDate_idx" ON "VehicleSupplierSettlement"("supplierId", "paidDate");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDocumentCase_saleId_key" ON "VehicleDocumentCase"("saleId");

-- CreateIndex
CREATE INDEX "VehicleDocumentCase_status_updatedAt_idx" ON "VehicleDocumentCase"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "VehicleDocumentItem_caseId_status_idx" ON "VehicleDocumentItem"("caseId", "status");

-- CreateIndex
CREATE INDEX "VehicleDocumentEvent_caseId_createdAt_idx" ON "VehicleDocumentEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "VehicleDocumentAcknowledgement_caseId_signedAt_idx" ON "VehicleDocumentAcknowledgement"("caseId", "signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDocumentAcknowledgement_caseId_type_key" ON "VehicleDocumentAcknowledgement"("caseId", "type");

-- AddForeignKey
ALTER TABLE "ConsignmentVehicle" ADD CONSTRAINT "ConsignmentVehicle_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentVehicle" ADD CONSTRAINT "ConsignmentVehicle_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSale" ADD CONSTRAINT "VehicleSale_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "ConsignmentVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSale" ADD CONSTRAINT "VehicleSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSale" ADD CONSTRAINT "VehicleSale_soldByEmployeeId_fkey" FOREIGN KEY ("soldByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSale" ADD CONSTRAINT "VehicleSale_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSale" ADD CONSTRAINT "VehicleSale_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCustomerPayment" ADD CONSTRAINT "VehicleCustomerPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "VehicleSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCustomerPayment" ADD CONSTRAINT "VehicleCustomerPayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCreditAgreement" ADD CONSTRAINT "VehicleCreditAgreement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "VehicleSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSupplierSettlement" ADD CONSTRAINT "VehicleSupplierSettlement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "VehicleSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSupplierSettlement" ADD CONSTRAINT "VehicleSupplierSettlement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSupplierSettlement" ADD CONSTRAINT "VehicleSupplierSettlement_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocumentCase" ADD CONSTRAINT "VehicleDocumentCase_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "VehicleSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocumentItem" ADD CONSTRAINT "VehicleDocumentItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "VehicleDocumentCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocumentItem" ADD CONSTRAINT "VehicleDocumentItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocumentEvent" ADD CONSTRAINT "VehicleDocumentEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "VehicleDocumentCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocumentEvent" ADD CONSTRAINT "VehicleDocumentEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocumentAcknowledgement" ADD CONSTRAINT "VehicleDocumentAcknowledgement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "VehicleDocumentCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocumentAcknowledgement" ADD CONSTRAINT "VehicleDocumentAcknowledgement_witnessedByUserId_fkey" FOREIGN KEY ("witnessedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financial invariants are also enforced in the database so a future code path
-- cannot silently create a negative collection or alter the agreed deal split.
ALTER TABLE "ConsignmentVehicle"
  ADD CONSTRAINT "ConsignmentVehicle_non_negative_terms" CHECK ("listPrice" >= 0 AND "supplierSettlementDue" >= 0);
ALTER TABLE "VehicleSale"
  ADD CONSTRAINT "VehicleSale_deal_split_consistent" CHECK (
    "listPrice" >= 0
    AND "supplierSettlementDue" >= 0
    AND "customerDiscount" >= 0
    AND "customerPrice" = "listPrice" - "customerDiscount"
    AND "grossDealerCommission" = "listPrice" - "supplierSettlementDue"
    AND "netDealerCommission" = "customerPrice" - "supplierSettlementDue"
    AND "customerCollected" >= 0
    AND "supplierPaid" >= 0
  );
ALTER TABLE "VehicleCustomerPayment"
  ADD CONSTRAINT "VehicleCustomerPayment_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "VehicleSupplierSettlement"
  ADD CONSTRAINT "VehicleSupplierSettlement_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "VehicleCreditAgreement"
  ADD CONSTRAINT "VehicleCreditAgreement_valid_terms" CHECK (
    "principal" >= 0
    AND "interestRatePerMonth" >= 0
    AND "interestFreeMonths" >= 0
    AND ("termMonths" IS NULL OR "termMonths" > 0)
    AND ("expectedInstallment" IS NULL OR "expectedInstallment" > 0)
  );

-- A signed custody acknowledgement is evidence, not an editable form row.
CREATE FUNCTION "prevent_vehicle_acknowledgement_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Vehicle document acknowledgements are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VehicleDocumentAcknowledgement_immutable"
BEFORE UPDATE OR DELETE ON "VehicleDocumentAcknowledgement"
FOR EACH ROW EXECUTE FUNCTION "prevent_vehicle_acknowledgement_mutation"();
