-- Preserve mistaken invoices as an auditable accounting reversal.
ALTER TYPE "CreditStatus" ADD VALUE 'VOIDED';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_VOID';

ALTER TABLE "Invoice"
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "voidedByUserId" TEXT;

CREATE INDEX "Invoice_voidedAt_idx" ON "Invoice"("voidedAt");
CREATE INDEX "Invoice_voidedByUserId_idx" ON "Invoice"("voidedByUserId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
