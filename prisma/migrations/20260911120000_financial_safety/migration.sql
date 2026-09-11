BEGIN;
-- Abort rather than hold up the operating business if the table is busy.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Additive only. No historical financial or authentication records are changed.
ALTER TABLE "SalesReturn" ADD COLUMN "cashRefund" DECIMAL(12,2);
ALTER TABLE "SalesReturn" ADD COLUMN "balanceCredit" DECIMAL(12,2);
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_valid_split" CHECK (
  ("cashRefund" IS NULL AND "balanceCredit" IS NULL) OR
  ("cashRefund" IS NOT NULL AND "balanceCredit" IS NOT NULL AND
   "cashRefund" >= 0 AND "balanceCredit" >= 0 AND
   "cashRefund" + "balanceCredit" <= "totalRefund")
);
CREATE TABLE "AuthAttemptWindow" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

COMMIT;
