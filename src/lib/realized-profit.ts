import { round2 } from "./utils";

export type RealizedGrossProfitInput = {
  saleRevenue: number;
  saleCost: number;
  returnedRevenue?: number;
  returnedCost?: number;
  saleDiscount?: number;
  principalCollected: number;
};

/**
 * Cash-recovery view of gross profit for one sale, measured cumulatively.
 * Collections recover the net cost of the goods first; only the portion above
 * that threshold is realized gross profit. Interest is deliberately excluded
 * because it is reported as separate finance income.
 */
export function cumulativeRealizedGrossProfit({
  saleRevenue,
  saleCost,
  returnedRevenue = 0,
  returnedCost = 0,
  saleDiscount = 0,
  principalCollected,
}: RealizedGrossProfitInput): number {
  const netRevenue = Math.max(0, round2(saleRevenue - returnedRevenue - saleDiscount));
  const netCost = Math.max(0, round2(saleCost - returnedCost));
  const availableGrossProfit = Math.max(0, round2(netRevenue - netCost));
  const recoveredAboveCost = Math.max(0, round2(principalCollected - netCost));

  return round2(Math.min(availableGrossProfit, recoveredAboveCost));
}
