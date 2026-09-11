import { describe, expect, it } from "vitest";
import { customerReturnAllowances, returnLineValue, supplierReturnAllowances } from "./return-values";
import { cashRefundAmount, returnSettlementLabel } from "./returns";

const sold = (id = "p", qty = 1, price = 1000) => ({ productId: id, qty, unitPrice: price, unitDiscount: 0, unit: "EACH" });
describe("return value allocation", () => {
  it("refunds only the discounted sale value", () => {
    const allowance = customerReturnAllowances(800, [sold()], []).get("p")!;
    expect(returnLineValue(allowance, 1)).toBe(800);
  });
  it("conserves every cent over repeated partial returns", () => {
    const items = [sold("p", 3, 0.34)];
    const previous: { totalRefund: number; items: { productId: string; qty: number; lineTotal: number }[] }[] = [];
    for (let i = 0; i < 3; i++) {
      const value = returnLineValue(customerReturnAllowances(1, items, previous).get("p")!, 1);
      previous.push({ totalRefund: value, items: [{ productId: "p", qty: 1, lineTotal: value }] });
    }
    expect(previous.map((r) => r.totalRefund)).toEqual([0.33, 0.34, 0.33]);
    expect(customerReturnAllowances(1, items, previous).get("p")!.qty).toBe(0);
  });
  it("caps further refunds after a legacy over-refund without altering the legacy record", () => {
    const previous = [{ totalRefund: 1000, items: [{ productId: "p", qty: 1, lineTotal: 1000 }] }];
    const allowances = customerReturnAllowances(1600, [sold(), sold("q")], previous);
    expect(returnLineValue(allowances.get("q")!, 1)).toBe(600);
    expect(previous[0].totalRefund).toBe(1000);
  });
  it("handles product discounts and stable per-product rounding", () => {
    const allowances = customerReturnAllowances(0.05, [sold("a", 1, 0.03), sold("b", 1, 0.03)], []);
    expect([...allowances.values()].reduce((s, a) => s + a.value, 0)).toBe(0.05);
    expect(customerReturnAllowances(800, [{ ...sold(), unitDiscount: 100 }], []).get("p")!.value).toBe(800);
  });
  it("rejects fractional pieces, excess precision, and excess quantities", () => {
    const allowance = { qty: 1, value: 100, unit: "EACH" };
    expect(() => returnLineValue(allowance, 0.5)).toThrow("whole");
    expect(() => returnLineValue(allowance, 2)).toThrow();
    expect(() => returnLineValue({ ...allowance, unit: "METER" }, 0.00001)).toThrow();
    expect(returnLineValue({ ...allowance, unit: "METER" }, 0.25)).toBe(25);
  });
  it("derives supplier allowances from purchased quantities and previous returns", () => {
    const allowances = supplierReturnAllowances([{ productId: "p", qty: 2, costPrice: 100, unit: "EACH" }], [{ productId: "p", qty: 1, lineTotal: 100 }]);
    expect(allowances.get("unrelated")).toBeUndefined();
    expect(returnLineValue(allowances.get("p")!, 1)).toBe(100);
    expect(() => returnLineValue(allowances.get("p")!, 2)).toThrow();
  });
  it("counts only actual cash while retaining legacy CASH behavior", () => {
    expect(cashRefundAmount({ method: "MIXED", totalRefund: 1000, cashRefund: 800 })).toBe(800);
    expect(cashRefundAmount({ method: "CASH", totalRefund: 500, cashRefund: null })).toBe(500);
    expect(cashRefundAmount({ method: "CREDIT_BALANCE", totalRefund: 1000, cashRefund: null })).toBe(0);
    expect(cashRefundAmount({ method: "CREDIT_NOTE", totalRefund: 500, cashRefund: 0 })).toBe(0);
    expect(returnSettlementLabel({ method: "MIXED", totalRefund: 1000, cashRefund: 800, balanceCredit: 200 })).toContain("balance credit");
  });
});
