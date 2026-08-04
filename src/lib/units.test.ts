import { describe, expect, it } from "vitest";
import { formatEnteredQuantity, toCanonicalQuantity } from "./units";

describe("unit conversions", () => {
  it("converts imperial lengths to metres without losing stock precision", () => {
    expect(toCanonicalQuantity(6, "FOOT", "LENGTH")).toBe(1.8288);
    expect(toCanonicalQuantity(36, "INCH", "LENGTH")).toBe(0.9144);
  });

  it("converts metric sub-units to metres", () => {
    expect(toCanonicalQuantity(50, "CENTIMETER", "LENGTH")).toBe(0.5);
    expect(toCanonicalQuantity(1250, "MILLIMETER", "LENGTH")).toBe(1.25);
  });

  it("rejects length units for piece products", () => {
    expect(toCanonicalQuantity(2, "METER", "PIECE")).toBeNaN();
  });

  it("keeps the entered unit on customer-facing quantities", () => {
    expect(formatEnteredQuantity(1.8288, "METER", 6, "FOOT")).toBe("6 ft (1.8288 m)");
  });
});
