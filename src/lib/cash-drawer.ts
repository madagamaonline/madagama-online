export const CASH_DENOMINATIONS = [
  { key: "n5000", label: "Rs. 5,000", value: 5000 },
  { key: "n2000", label: "Rs. 2,000", value: 2000 },
  { key: "n1000", label: "Rs. 1,000", value: 1000 },
  { key: "n500", label: "Rs. 500", value: 500 },
  { key: "n100", label: "Rs. 100", value: 100 },
  { key: "n50", label: "Rs. 50", value: 50 },
  { key: "n20", label: "Rs. 20", value: 20 },
] as const;

export type NoteDenominationKey = (typeof CASH_DENOMINATIONS)[number]["key"];

export type DenominationCounts = Record<NoteDenominationKey, number> & {
  looseCoins: number;
};

export const EMPTY_DENOMINATION_COUNTS: DenominationCounts = {
  n5000: 0,
  n2000: 0,
  n1000: 0,
  n500: 0,
  n100: 0,
  n50: 0,
  n20: 0,
  looseCoins: 0,
};

export function denominationTotal(counts: DenominationCounts): number {
  return (
    CASH_DENOMINATIONS.reduce((sum, denomination) => {
      return sum + counts[denomination.key] * denomination.value;
    }, 0) + counts.looseCoins
  );
}

export type CashActivity = {
  totalCashSales: number;
  totalRepayments: number;
  totalOpenAccountCollections: number;
  totalLayawayCollections: number;
  totalCashRefunds: number;
  totalCashAdditions: number;
  totalCashWithdrawals: number;
};

export function expectedDrawerCash(openingCash: number, activity: CashActivity): number {
  return (
    openingCash +
    activity.totalCashSales +
    activity.totalRepayments +
    activity.totalOpenAccountCollections +
    activity.totalLayawayCollections +
    activity.totalCashAdditions -
    activity.totalCashRefunds -
    activity.totalCashWithdrawals
  );
}
