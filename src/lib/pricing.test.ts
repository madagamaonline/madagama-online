import { describe, it, expect } from "vitest";
import {
  grossMarginPct,
  markupPct,
  profit,
  priceFromMargin,
  weightedAvgCost,
  roundToStep,
} from "./pricing";

describe("grossMarginPct / markupPct / profit", () => {
  it("computes margin on selling price and markup on cost", () => {
    // cost 80, price 100 → margin 20%, markup 25%
    expect(grossMarginPct(80, 100)).toBeCloseTo(20, 6);
    expect(markupPct(80, 100)).toBeCloseTo(25, 6);
    expect(profit(80, 100)).toBe(20);
  });

  it("never divides by zero", () => {
    expect(grossMarginPct(50, 0)).toBe(0);
    expect(markupPct(0, 100)).toBe(0);
    expect(Number.isFinite(grossMarginPct(50, 0))).toBe(true);
  });

  it("reports negative margin when selling below cost", () => {
    expect(grossMarginPct(100, 80)).toBeCloseTo(-25, 6);
    expect(profit(100, 80)).toBe(-20);
  });
});

describe("priceFromMargin", () => {
  it("inverts grossMarginPct (round-trip)", () => {
    const price = priceFromMargin(80, 20); // → 100
    expect(price).toBeCloseTo(100, 2);
    expect(grossMarginPct(80, price)).toBeCloseTo(20, 6);
  });

  it("guards impossible margins and bad cost", () => {
    expect(priceFromMargin(0, 25)).toBe(0);
    expect(priceFromMargin(100, 100)).toBe(100); // 100% would be infinite → clamp
    expect(priceFromMargin(100, 0)).toBe(100);
  });
});

describe("weightedAvgCost", () => {
  it("blends existing and new stock", () => {
    // 10 @ 100 + 20 @ 110 = 3200 / 30 = 106.67
    expect(weightedAvgCost(10, 100, 20, 110)).toBe(106.67);
  });

  it("uses the new cost when there is no existing stock", () => {
    expect(weightedAvgCost(0, 999, 5, 120)).toBe(120);
    expect(weightedAvgCost(-3, 999, 5, 120)).toBe(120); // negative balance too
  });

  it("keeps the current cost when nothing is added", () => {
    expect(weightedAvgCost(10, 100, 0, 9999)).toBe(100);
  });
});

describe("roundToStep", () => {
  it("snaps to the nearest multiple", () => {
    expect(roundToStep(133.33, 5)).toBe(135);
    expect(roundToStep(132.0, 5)).toBe(130);
    expect(roundToStep(133.33, 1)).toBe(133);
  });

  it("falls back to 2dp rounding when step ≤ 0", () => {
    expect(roundToStep(133.333, 0)).toBe(133.33);
    expect(roundToStep(133.335, -1)).toBeCloseTo(133.34, 6);
  });
});
