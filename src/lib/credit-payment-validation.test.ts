import { describe, expect, it } from "vitest";
import { validateCreditPaymentTimeline } from "./credit-payment-validation";
const terms = { principal: 1000, startDate: new Date("2026-08-01T00:00:00Z"), interestRatePerMonth: 0, interestFreeMonths: 4 };
const now = new Date("2026-09-11T12:00:00Z");
const existing = [{ amount: 800, paidDate: new Date("2026-09-10T00:00:00Z") }];
describe("backdated credit payments", () => {
  it("rejects money exceeding the balance after later payments are considered", () => {
    expect(validateCreditPaymentTimeline(terms, existing, { amount: 500, paidDate: new Date("2026-09-09") }, now)).toContain("overpay");
  });
  it("allows backdated settlement within the complete balance", () => {
    expect(validateCreditPaymentTimeline(terms, existing, { amount: 200, paidDate: new Date("2026-09-09") }, now)).toBeNull();
  });
  it("rejects future, invalid and pre-sale dates", () => {
    for (const date of ["bad", "2026-10-01", "2026-07-01"]) expect(validateCreditPaymentTimeline(terms, [], { amount: 100, paidDate: new Date(date) }, now)).not.toBeNull();
  });
  it("respects future-dated receipts created by older versions", () => {
    expect(validateCreditPaymentTimeline(terms, [{ amount: 800, paidDate: new Date("2026-09-20") }], { amount: 500, paidDate: new Date("2026-09-11") }, now)).toContain("overpay");
  });
  it("includes non-cash discounts in the overpayment guard", () => {
    expect(validateCreditPaymentTimeline(terms, existing, { amount: 100, discount: 101, paidDate: new Date("2026-09-09") }, now)).toContain("overpay");
  });
});
