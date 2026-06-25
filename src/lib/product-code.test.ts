import { describe, it, expect } from "vitest";
import { buildProductCode } from "./product-code";

describe("buildProductCode", () => {
  it("zero-pads the sequence to 4 digits", () => {
    expect(buildProductCode("AGR", "TOOL", 1)).toBe("AGR-TOOL-0001");
    expect(buildProductCode("ELC", "TV", 7)).toBe("ELC-TV-0007");
    expect(buildProductCode("AGR", "SPRT", 123)).toBe("AGR-SPRT-0123");
  });

  it("does not truncate sequences longer than 4 digits", () => {
    expect(buildProductCode("ELC", "PART", 12345)).toBe("ELC-PART-12345");
  });
});
