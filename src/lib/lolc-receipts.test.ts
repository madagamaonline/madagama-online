import { describe, expect, it } from "vitest";
import {
  ageInDays,
  canTransitionLolcReceipt,
  lolcReceiptNumber,
  lolcStatusLabel,
  normalizeLolcPhone,
  parseSriLankaBusinessDate,
} from "./lolc-receipts";

describe("LOLC receipt helpers", () => {
  it("formats permanent numbers and status labels", () => {
    expect(lolcReceiptNumber(42)).toBe("LOLC-000042");
    expect(lolcStatusLabel("MCASH_SENT")).toBe("Waiting for LOLC");
  });

  it("allows only the documented workflow", () => {
    expect(canTransitionLolcReceipt("COLLECTED", "MCASH_SENT")).toBe(true);
    expect(canTransitionLolcReceipt("MCASH_SENT", "NEEDS_ATTENTION")).toBe(true);
    expect(canTransitionLolcReceipt("NEEDS_ATTENTION", "LOLC_CONFIRMED")).toBe(true);
    expect(canTransitionLolcReceipt("COLLECTED", "LOLC_CONFIRMED")).toBe(false);
    expect(canTransitionLolcReceipt("VOIDED", "MCASH_SENT")).toBe(false);
    expect(canTransitionLolcReceipt("LOLC_CONFIRMED", "VOIDED")).toBe(true);
  });

  it("normalizes LK phones and business dates", () => {
    expect(normalizeLolcPhone("+94 77 123 4567")).toBe("0771234567");
    expect(parseSriLankaBusinessDate("2026-07-22").toISOString()).toBe("2026-07-21T18:30:00.000Z");
    expect(() => normalizeLolcPhone("123")).toThrow(/valid Sri Lankan/);
  });

  it("calculates non-negative whole-day age", () => {
    expect(ageInDays(new Date("2026-07-20T00:00:00Z"), new Date("2026-07-22T12:00:00Z"))).toBe(2);
    expect(ageInDays(new Date("2026-07-23T00:00:00Z"), new Date("2026-07-22T00:00:00Z"))).toBe(0);
  });
});
