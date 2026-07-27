import { describe, expect, it } from "vitest";
import { isValidUnitDiscount } from "./sale-discounts";

describe("isValidUnitDiscount", () => {
  it("accepts zero, partial, and full per-unit discounts", () => {
    expect(isValidUnitDiscount(100, 0)).toBe(true);
    expect(isValidUnitDiscount(100, 25)).toBe(true);
    expect(isValidUnitDiscount(100, 100)).toBe(true);
  });

  it("rejects negative and above-price discounts", () => {
    expect(isValidUnitDiscount(100, -1)).toBe(false);
    expect(isValidUnitDiscount(100, 100.01)).toBe(false);
  });
});
