import { describe, expect, it } from "vitest";
import {
  denominationTotal,
  expectedDrawerCash,
  type DenominationCounts,
} from "./cash-drawer";

describe("cash drawer reconciliation", () => {
  it("totals note counts and loose coins", () => {
    const counts: DenominationCounts = {
      n5000: 1,
      n2000: 2,
      n1000: 3,
      n500: 4,
      n100: 5,
      n50: 6,
      n20: 7,
      looseCoins: 45,
    };

    expect(denominationTotal(counts)).toBe(14_985);
  });

  it("includes opening float and cash movements in expected cash", () => {
    expect(
      expectedDrawerCash(20_000, {
        totalCashSales: 80_000,
        totalRepayments: 5_000,
        totalOpenAccountCollections: 2_000,
        totalLayawayCollections: 1_000,
        totalCashRefunds: 4_000,
        totalCashAdditions: 500,
        totalCashWithdrawals: 3_500,
      }),
    ).toBe(101_000);
  });
});
