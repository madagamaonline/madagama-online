import { describe, expect, it } from "vitest";
import {
  assertUniqueProductLines,
  isRecentDuplicatePayment,
  remainingReturnableByProduct,
  validateDownPaymentAmount,
  validatePaymentAmount,
  validatePaymentWithDiscount,
} from "./financial-guards";

describe("financial workflow guards", () => {
  it("rejects duplicate product lines", () => {
    expect(() => assertUniqueProductLines([{ productId: "a" }, { productId: "a" }])).toThrow(
      "DUPLICATE_PRODUCT",
    );
  });

  it("calculates remaining returnable quantities", () => {
    const remaining = remainingReturnableByProduct(
      [{ productId: "a", qty: 3, unitPrice: 250 }],
      [{ productId: "a", qty: 1 }],
    );
    expect(remaining.get("a")).toEqual({ qty: 2, unitPrice: 250 });
  });

  it("rejects settled and excessive payments", () => {
    expect(validatePaymentAmount(10, 0)).toBe("This balance is already settled.");
    expect(validatePaymentAmount(101, 100)).toContain("exceeds");
    expect(validatePaymentAmount(100, 100)).toBeNull();
  });

  it("validates a payment and settlement discount against the balance", () => {
    expect(validatePaymentWithDiscount(9000, 16000, 25000)).toBeNull();
    expect(validatePaymentWithDiscount(9000, 16001, 25000)).toContain("plus discount exceeds");
    expect(validatePaymentWithDiscount(9000, -1, 25000)).toContain("valid settlement discount");
  });

  it("validates a down payment against the full sale total", () => {
    expect(validateDownPaymentAmount(30_000, 90_000)).toBeNull();
    expect(validateDownPaymentAmount(0, 90_000)).toBeNull();
    expect(validateDownPaymentAmount(-1, 90_000)).toContain("valid down payment");
    expect(validateDownPaymentAmount(90_001, 90_000)).toContain("exceeds");
    expect(validateDownPaymentAmount(90_000, 90_000)).toContain("cash sale");
  });

  it("detects an identical payment repeated by the same operator within 30 seconds", () => {
    const now = new Date("2026-07-11T10:00:00.000Z");
    const paidDate = new Date("2026-07-11T00:00:00.000Z");
    expect(
      isRecentDuplicatePayment(
        [{
          amount: 500,
          discount: 0,
          paidDate,
          method: "CASH",
          note: null,
          recordedByUserId: "u1",
          createdAt: new Date(now.getTime() - 5_000),
        }],
        { amount: 500, discount: 0, paidDate, method: "CASH", note: null, recordedByUserId: "u1" },
        now,
      ),
    ).toBe(true);
  });
});
