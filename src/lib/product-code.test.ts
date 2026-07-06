import { describe, it, expect } from "vitest";
import { buildProductCode, parseShortCode } from "./product-code";

describe("buildProductCode", () => {
  it("zero-pads the sequence to 4 digits", () => {
    expect(buildProductCode("AGR", "TOOL", 1)).toBe("AGR-TOOL-0001");
    expect(buildProductCode("ELC", "TV", 7)).toBe("ELC-TV-0007");
    expect(buildProductCode("AGR", "SPRT", 123)).toBe("AGR-SPRT-0123");
  });

  it("does not truncate sequences longer than 4 digits", () => {
    expect(buildProductCode("ELC", "PART", 12345)).toBe("ELC-PART-12345");
  });

  it("drops the middle segment when there is no subcategory", () => {
    expect(buildProductCode("AGR", null, 1)).toBe("AGR-0001");
    expect(buildProductCode("ELC", null, 42)).toBe("ELC-0042");
  });
});

describe("parseShortCode", () => {
  it("parses plain numbers and #-prefixed numbers", () => {
    expect(parseShortCode("123")).toBe(123);
    expect(parseShortCode("#123")).toBe(123);
    expect(parseShortCode(" 7 ")).toBe(7);
  });

  it("rejects anything that is not a sticker code", () => {
    expect(parseShortCode("")).toBeNull();
    expect(parseShortCode("#")).toBeNull();
    expect(parseShortCode("AGR-TOOL-0001")).toBeNull();
    expect(parseShortCode("12a")).toBeNull();
    expect(parseShortCode("1.5")).toBeNull();
    expect(parseShortCode("1234567890")).toBeNull(); // >9 digits would overflow int4
  });
});
