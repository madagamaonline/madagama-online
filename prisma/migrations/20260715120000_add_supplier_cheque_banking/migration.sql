-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branch" TEXT,
    "overdraftLimit" DECIMAL(12,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedCheque" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "chequeNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IssuedCheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChequePayment" (
    "id" TEXT NOT NULL,
    "issuedChequeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChequePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankAccount_active_idx" ON "BankAccount"("active");
CREATE INDEX "BankAccount_bankName_idx" ON "BankAccount"("bankName");
CREATE UNIQUE INDEX "IssuedCheque_bankAccountId_chequeNumber_key" ON "IssuedCheque"("bankAccountId", "chequeNumber");
CREATE INDEX "IssuedCheque_supplierId_idx" ON "IssuedCheque"("supplierId");
CREATE INDEX "IssuedCheque_purchaseId_idx" ON "IssuedCheque"("purchaseId");
CREATE INDEX "IssuedCheque_dueDate_idx" ON "IssuedCheque"("dueDate");
CREATE INDEX "ChequePayment_issuedChequeId_paidDate_idx" ON "ChequePayment"("issuedChequeId", "paidDate");

ALTER TABLE "IssuedCheque" ADD CONSTRAINT "IssuedCheque_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IssuedCheque" ADD CONSTRAINT "IssuedCheque_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IssuedCheque" ADD CONSTRAINT "IssuedCheque_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChequePayment" ADD CONSTRAINT "ChequePayment_issuedChequeId_fkey" FOREIGN KEY ("issuedChequeId") REFERENCES "IssuedCheque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
