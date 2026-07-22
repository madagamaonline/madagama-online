-- CreateEnum
CREATE TYPE "LolcReceiptStatus" AS ENUM ('COLLECTED', 'MCASH_SENT', 'NEEDS_ATTENTION', 'LOLC_CONFIRMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "LolcReceiptEventType" AS ENUM ('CREATED', 'MCASH_SENT', 'ISSUE_REPORTED', 'LOLC_CONFIRMED', 'VOIDED');

-- CreateTable
CREATE TABLE "LolcReceipt" (
    "id" TEXT NOT NULL,
    "receiptNumber" SERIAL NOT NULL,
    "submissionKey" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "lolcCode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "LolcReceiptStatus" NOT NULL DEFAULT 'COLLECTED',
    "mCashReference" TEXT,
    "remittedAt" TIMESTAMP(3),
    "remittedByUserId" TEXT,
    "lolcConfirmationReference" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "issueNote" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    CONSTRAINT "LolcReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LolcReceiptEvent" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "type" "LolcReceiptEventType" NOT NULL,
    "fromStatus" "LolcReceiptStatus",
    "toStatus" "LolcReceiptStatus" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LolcReceiptEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LolcReceipt_receiptNumber_key" ON "LolcReceipt"("receiptNumber");
CREATE UNIQUE INDEX "LolcReceipt_submissionKey_key" ON "LolcReceipt"("submissionKey");
CREATE INDEX "LolcReceipt_status_collectedAt_idx" ON "LolcReceipt"("status", "collectedAt");
CREATE INDEX "LolcReceipt_lolcCode_idx" ON "LolcReceipt"("lolcCode");
CREATE INDEX "LolcReceipt_customerPhone_idx" ON "LolcReceipt"("customerPhone");
CREATE INDEX "LolcReceipt_mCashReference_idx" ON "LolcReceipt"("mCashReference");
CREATE UNIQUE INDEX "LolcReceiptEvent_idempotencyKey_key" ON "LolcReceiptEvent"("idempotencyKey");
CREATE INDEX "LolcReceiptEvent_receiptId_occurredAt_idx" ON "LolcReceiptEvent"("receiptId", "occurredAt");

ALTER TABLE "LolcReceipt" ADD CONSTRAINT "LolcReceipt_remittedByUserId_fkey" FOREIGN KEY ("remittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LolcReceipt" ADD CONSTRAINT "LolcReceipt_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LolcReceipt" ADD CONSTRAINT "LolcReceipt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LolcReceipt" ADD CONSTRAINT "LolcReceipt_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LolcReceiptEvent" ADD CONSTRAINT "LolcReceiptEvent_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "LolcReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LolcReceiptEvent" ADD CONSTRAINT "LolcReceiptEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
