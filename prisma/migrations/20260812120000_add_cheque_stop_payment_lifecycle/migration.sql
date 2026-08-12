-- Cheque stop-payment / bounce / cancel lifecycle + replacement chain.
-- Purely additive: no existing column is altered or dropped.

-- CreateEnum
CREATE TYPE "ChequeVoidKind" AS ENUM ('STOPPED', 'BOUNCED', 'CANCELLED');

-- AlterTable
ALTER TABLE "IssuedCheque" ADD COLUMN     "clearedDate" TIMESTAMP(3),
ADD COLUMN     "replacesChequeId" TEXT,
ADD COLUMN     "reversedAmount" DECIMAL(12,2),
ADD COLUMN     "voidKind" "ChequeVoidKind",
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCheque_replacesChequeId_key" ON "IssuedCheque"("replacesChequeId");

-- CreateIndex
CREATE INDEX "IssuedCheque_voidedAt_idx" ON "IssuedCheque"("voidedAt");

-- AddForeignKey
ALTER TABLE "IssuedCheque" ADD CONSTRAINT "IssuedCheque_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCheque" ADD CONSTRAINT "IssuedCheque_replacesChequeId_fkey" FOREIGN KEY ("replacesChequeId") REFERENCES "IssuedCheque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
