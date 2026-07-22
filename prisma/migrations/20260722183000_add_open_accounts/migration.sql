ALTER TYPE "InvoiceType" ADD VALUE 'OPEN_ACCOUNT';

CREATE TYPE "OpenAccountStatus" AS ENUM ('ACTIVE', 'SETTLED', 'VOIDED');

CREATE TABLE "OpenAccount" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "principal" DECIMAL(12,2) NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  "status" "OpenAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpenAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpenAccountPayment" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" TEXT NOT NULL DEFAULT 'CASH',
  "note" TEXT,
  "recordedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpenAccountPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpenAccount_invoiceId_key" ON "OpenAccount"("invoiceId");
CREATE INDEX "OpenAccount_status_dueDate_idx" ON "OpenAccount"("status", "dueDate");
CREATE INDEX "OpenAccount_customerId_status_idx" ON "OpenAccount"("customerId", "status");
CREATE INDEX "OpenAccount_openedAt_idx" ON "OpenAccount"("openedAt");
CREATE INDEX "OpenAccountPayment_accountId_paidDate_idx" ON "OpenAccountPayment"("accountId", "paidDate");
CREATE INDEX "OpenAccountPayment_createdAt_idx" ON "OpenAccountPayment"("createdAt");

ALTER TABLE "OpenAccount" ADD CONSTRAINT "OpenAccount_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenAccount" ADD CONSTRAINT "OpenAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenAccountPayment" ADD CONSTRAINT "OpenAccountPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OpenAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenAccountPayment" ADD CONSTRAINT "OpenAccountPayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
