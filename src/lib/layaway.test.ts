import { describe, expect, it } from "vitest";
import { canHandover, layawayBalance, layawayTotals, statusAfterCollection, validateLayawayPayment } from "@/lib/layaway";

describe("layaway domain", () => {
  it("computes totals and caps discount", () => {
    expect(layawayTotals([{ qty: 2, unitPrice: 25000 }], 2000)).toEqual({ subtotal: 50000, discount: 2000, total: 48000 });
    expect(layawayTotals([{ qty: 1, unitPrice: 100 }], 150).total).toBe(0);
  });
  it("validates installments", () => {
    expect(validateLayawayPayment(0, 100)).toBeTruthy();
    expect(validateLayawayPayment(101, 100)).toBeTruthy();
    expect(validateLayawayPayment(100, 100)).toBeNull();
  });
  it("transitions only when fully collected", () => {
    expect(statusAfterCollection(50000, 49999)).toBe("ACTIVE");
    expect(statusAfterCollection(50000, 50000)).toBe("PAID_AWAITING_PICKUP");
    expect(canHandover("ACTIVE", 50000, 50000)).toBe(false);
    expect(canHandover("PAID_AWAITING_PICKUP", 50000, 50000)).toBe(true);
    expect(layawayBalance(50000, 30000)).toBe(20000);
  });
});
