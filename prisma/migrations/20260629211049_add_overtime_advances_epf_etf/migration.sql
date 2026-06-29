-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('OUTSTANDING', 'RECOVERED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "epfEtfMember" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "epfNumber" TEXT;

-- AlterTable
ALTER TABLE "PayrollLine" ADD COLUMN     "advanceDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "epfEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "epfEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "etf" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "overtimeTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "epfEmployeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0.08,
ADD COLUMN     "epfEmployerRate" DECIMAL(6,4) NOT NULL DEFAULT 0.12,
ADD COLUMN     "etfRate" DECIMAL(6,4) NOT NULL DEFAULT 0.03;

-- CreateTable
CREATE TABLE "Overtime" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hours" DECIMAL(6,2) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Overtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryAdvance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "recoveredRunId" TEXT,
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Overtime_employeeId_idx" ON "Overtime"("employeeId");

-- CreateIndex
CREATE INDEX "Overtime_date_idx" ON "Overtime"("date");

-- CreateIndex
CREATE INDEX "SalaryAdvance_employeeId_status_idx" ON "SalaryAdvance"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
