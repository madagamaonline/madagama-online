import { describe, it, expect } from "vitest";
import { computePayLine, selectAdvancesToRecover, type PayRates } from "./payroll-math";

const RATES: PayRates = { epfEmployee: 0.08, epfEmployer: 0.12, etf: 0.03 };

const base = {
  overtimeTotal: 0,
  commissionsTotal: 0,
  outstandingAdvances: [] as { id: string; amount: number }[],
  rates: RATES,
};

describe("computePayLine — EPF/ETF", () => {
  it("computes EPF/ETF on basic wages only (excludes overtime + commissions)", () => {
    const l = computePayLine({
      ...base,
      daysWorked: 20,
      dailyRate: 1000, // base = 20,000
      overtimeTotal: 2000,
      commissionsTotal: 3000,
      epfEtfMember: true,
    });
    expect(l.baseSalary).toBe(20000);
    expect(l.grossPay).toBe(25000); // base + OT + commission
    // 8% / 12% / 3% of BASE (20,000), not gross
    expect(l.epfEmployee).toBe(1600);
    expect(l.epfEmployer).toBe(2400);
    expect(l.etf).toBe(600);
    expect(l.deductions).toBe(1600); // only employee EPF (no advance)
    expect(l.netPay).toBe(23400); // gross − employee EPF
    expect(l.employerCost).toBe(28000); // gross + employer EPF + ETF
  });

  it("applies no EPF/ETF for non-members", () => {
    const l = computePayLine({
      ...base,
      daysWorked: 20,
      dailyRate: 1000,
      overtimeTotal: 2000,
      epfEtfMember: false,
    });
    expect(l.epfEmployee).toBe(0);
    expect(l.epfEmployer).toBe(0);
    expect(l.etf).toBe(0);
    expect(l.netPay).toBe(l.grossPay); // 22,000
  });

  it("rounds to 2 decimals", () => {
    const l = computePayLine({
      ...base,
      daysWorked: 2.5,
      dailyRate: 1500.5, // base = 3,751.25
      epfEtfMember: true,
    });
    expect(l.baseSalary).toBe(3751.25);
    expect(l.epfEmployee).toBe(300.1); // 8% of 3,751.25 = 300.10
  });
});

describe("computePayLine — salary advances", () => {
  it("recovers an advance that fits and reduces net pay", () => {
    const l = computePayLine({
      ...base,
      daysWorked: 10,
      dailyRate: 1000, // base/gross = 10,000
      epfEtfMember: true, // epf 800 → capacity 9,200
      outstandingAdvances: [{ id: "a", amount: 5000 }],
    });
    expect(l.advanceDeduction).toBe(5000);
    expect(l.recoveredAdvanceIds).toEqual(["a"]);
    expect(l.netPay).toBe(4200); // 10,000 − 800 − 5,000
  });

  it("recovers oldest-first, whole-or-defer (does not partially split)", () => {
    const l = computePayLine({
      ...base,
      daysWorked: 10,
      dailyRate: 1000,
      epfEtfMember: true, // capacity 9,200
      outstandingAdvances: [
        { id: "a", amount: 5000 },
        { id: "b", amount: 5000 }, // 5,000 + 5,000 = 10,000 > 9,200 → defer b
      ],
    });
    expect(l.advanceDeduction).toBe(5000);
    expect(l.recoveredAdvanceIds).toEqual(["a"]);
  });

  it("defers an advance larger than capacity; net never goes negative", () => {
    const l = computePayLine({
      ...base,
      daysWorked: 10,
      dailyRate: 1000,
      epfEtfMember: true, // capacity 9,200
      outstandingAdvances: [{ id: "big", amount: 20000 }],
    });
    expect(l.advanceDeduction).toBe(0);
    expect(l.recoveredAdvanceIds).toEqual([]);
    expect(l.netPay).toBe(9200);
    expect(l.netPay).toBeGreaterThanOrEqual(0);
  });
});

describe("selectAdvancesToRecover", () => {
  it("recovers nothing when capacity is zero or negative", () => {
    expect(selectAdvancesToRecover([{ id: "a", amount: 100 }], 0)).toEqual({ deducted: 0, ids: [] });
    expect(selectAdvancesToRecover([{ id: "a", amount: 100 }], -50)).toEqual({ deducted: 0, ids: [] });
  });

  it("accumulates multiple small advances up to capacity", () => {
    const r = selectAdvancesToRecover(
      [
        { id: "a", amount: 1000 },
        { id: "b", amount: 2000 },
        { id: "c", amount: 9000 }, // would exceed 5,000 → stop
      ],
      5000,
    );
    expect(r.deducted).toBe(3000);
    expect(r.ids).toEqual(["a", "b"]);
  });
});
