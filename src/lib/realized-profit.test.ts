import { describe, expect, it } from "vitest";
import { cumulativeRealizedGrossProfit } from "./realized-profit";

describe("cumulativeRealizedGrossProfit", () => {
  const sale = { saleRevenue: 100000, saleCost: 60000 };

  it("shows no realized profit until collections recover cost", () => {
    expect(cumulativeRealizedGrossProfit({ ...sale, principalCollected: 20000 })).toBe(0);
    expect(cumulativeRealizedGrossProfit({ ...sale, principalCollected: 60000 })).toBe(0);
  });

  it("realizes only collections above cost and caps at invoiced gross profit", () => {
    expect(cumulativeRealizedGrossProfit({ ...sale, principalCollected: 75000 })).toBe(15000);
    expect(cumulativeRealizedGrossProfit({ ...sale, principalCollected: 100000 })).toBe(40000);
    expect(cumulativeRealizedGrossProfit({ ...sale, principalCollected: 120000 })).toBe(40000);
  });

  it("uses net revenue and cost after returns", () => {
    expect(
      cumulativeRealizedGrossProfit({
        ...sale,
        returnedRevenue: 20000,
        returnedCost: 12000,
        principalCollected: 50000,
      }),
    ).toBe(2000);
  });

  it("never reports realized profit for a loss-making sale", () => {
    expect(
      cumulativeRealizedGrossProfit({ saleRevenue: 80000, saleCost: 100000, principalCollected: 80000 }),
    ).toBe(0);
  });

  it("treats a principal settlement waiver as a reduction in sale revenue", () => {
    expect(
      cumulativeRealizedGrossProfit({
        saleRevenue: 115000,
        saleCost: 85000,
        saleDiscount: 16000,
        principalCollected: 99000,
      }),
    ).toBe(14000);
  });
});
