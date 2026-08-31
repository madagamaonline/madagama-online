-- Opening-float cash drawer lifecycle.
-- Purely additive: no existing table, column, or ShiftReport value is altered.

-- CreateEnum
CREATE TYPE "CashDrawerShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashDrawerMovementType" AS ENUM ('ADDITION', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "CashDrawerShift" (
    "id" TEXT NOT NULL,
    "status" "CashDrawerShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingCash" DECIMAL(12,2) NOT NULL,
    "openingDenominations" JSONB NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closingCash" DECIMAL(12,2),
    "closingDenominations" JSONB,
    "expectedCash" DECIMAL(12,2),
    "discrepancy" DECIMAL(12,2),
    "closingNotes" TEXT,
    "closedByUserId" TEXT,
    "shiftReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashDrawerShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDrawerMovement" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "CashDrawerMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDrawerMovement_pkey" PRIMARY KEY ("id")
);

-- Only one shop-wide drawer shift may be open at a time. A partial unique
-- index enforces this even if two cashiers click Open simultaneously.
CREATE UNIQUE INDEX "CashDrawerShift_single_open_key"
ON "CashDrawerShift" ((status)) WHERE "status" = 'OPEN';

-- CreateIndex
CREATE UNIQUE INDEX "CashDrawerShift_shiftReportId_key" ON "CashDrawerShift"("shiftReportId");
CREATE INDEX "CashDrawerShift_status_openedAt_idx" ON "CashDrawerShift"("status", "openedAt");
CREATE INDEX "CashDrawerShift_openedByUserId_idx" ON "CashDrawerShift"("openedByUserId");
CREATE INDEX "CashDrawerShift_closedByUserId_idx" ON "CashDrawerShift"("closedByUserId");
CREATE INDEX "CashDrawerMovement_shiftId_createdAt_idx" ON "CashDrawerMovement"("shiftId", "createdAt");
CREATE INDEX "CashDrawerMovement_createdByUserId_idx" ON "CashDrawerMovement"("createdByUserId");

-- AddForeignKey
ALTER TABLE "CashDrawerShift" ADD CONSTRAINT "CashDrawerShift_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrawerShift" ADD CONSTRAINT "CashDrawerShift_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerShift" ADD CONSTRAINT "CashDrawerShift_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerMovement" ADD CONSTRAINT "CashDrawerMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashDrawerShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrawerMovement" ADD CONSTRAINT "CashDrawerMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
