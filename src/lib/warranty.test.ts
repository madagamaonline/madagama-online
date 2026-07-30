import { describe, expect, it } from "vitest";
import {
  formatWarrantyMonths,
  isValidWarrantyMonths,
  normalizeWarrantyMonths,
} from "./warranty";

describe("isValidWarrantyMonths", () => {
  it("accepts no warranty, 6 months, and whole years through 10 years", () => {
    expect(isValidWarrantyMonths(null)).toBe(true);
    expect(isValidWarrantyMonths(6)).toBe(true);
    for (let months = 12; months <= 120; months += 12) {
      expect(isValidWarrantyMonths(months)).toBe(true);
    }
  });

  it("rejects values outside the warranty allowlist", () => {
    expect(isValidWarrantyMonths(undefined)).toBe(false);
    expect(isValidWarrantyMonths("12")).toBe(false);
    expect(isValidWarrantyMonths(0)).toBe(false);
    expect(isValidWarrantyMonths(18)).toBe(false);
    expect(isValidWarrantyMonths(132)).toBe(false);
  });
});

describe("normalizeWarrantyMonths", () => {
  it("falls back to no warranty for old or corrupt stored values", () => {
    expect(normalizeWarrantyMonths(undefined)).toBeNull();
    expect(normalizeWarrantyMonths(18)).toBeNull();
    expect(normalizeWarrantyMonths(120)).toBe(120);
  });
});

describe("formatWarrantyMonths", () => {
  it("formats months and singular or plural years", () => {
    expect(formatWarrantyMonths(6)).toBe("6 months");
    expect(formatWarrantyMonths(12)).toBe("1 year");
    expect(formatWarrantyMonths(24)).toBe("2 years");
    expect(formatWarrantyMonths(120)).toBe("10 years");
  });
});
