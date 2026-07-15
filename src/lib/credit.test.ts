import { describe, it, expect } from "vitest";
import { addDays, addMonths } from "date-fns";
import {
  buildCreditPaymentLedger,
  computeCreditState,
  type PaymentInput,
} from "./credit";

const start = new Date("2025-01-15T00:00:00Z");
const agreement = {
  principal: 50000,
  startDate: start,
  interestRatePerMonth: 0.02,
  interestFreeMonths: 4,
};

function pay(monthsFromStart: number, amount: number, extraDays = 0): PaymentInput {
  return { amount, paidDate: addDays(addMonths(start, monthsFromStart), extraDays) };
}

describe("computeCreditState", () => {
  it("charges no interest when fully paid within the grace period", () => {
    // TV example: 10k + 5k + 20k + 15k over the first 4 months = 50k
    const payments = [pay(1, 10000), pay(2, 5000), pay(3, 20000), pay(3, 15000, 10)];
    const s = computeCreditState(agreement, payments, addMonths(start, 4));
    expect(s.outstanding).toBe(0);
    expect(s.interestAccrued).toBe(0);
    expect(s.isSettled).toBe(true);
  });

  it("leaves a balance with zero interest during grace if partially paid", () => {
    const payments = [pay(1, 10000), pay(2, 5000), pay(3, 20000)];
    const s = computeCreditState(agreement, payments, addMonths(start, 3));
    expect(s.principalRemaining).toBe(15000);
    expect(s.interestAccrued).toBe(0);
    expect(s.outstanding).toBe(15000);
    expect(s.inGracePeriod).toBe(true);
    expect(s.isOverdue).toBe(false);
  });

  it("accrues 2% per month on full principal after grace (non-compounding)", () => {
    // No payments, 6 months in -> charges at month 5 and 6 = 1000 + 1000
    const s6 = computeCreditState(agreement, [], addMonths(start, 6));
    expect(s6.interestAccrued).toBe(2000);
    expect(s6.outstanding).toBe(52000);

    // 7 months -> 3 charges = 3000 (compounding would give ~3060.80)
    const s7 = computeCreditState(agreement, [], addMonths(start, 7));
    expect(s7.interestAccrued).toBe(3000);
    expect(s7.outstanding).toBe(53000);
    expect(s7.isOverdue).toBe(true);
  });

  it("charges interest on the reduced principal after a payment", () => {
    const payments = [pay(2, 30000)]; // pay 30k in month 2
    const s = computeCreditState(agreement, payments, addMonths(start, 6));
    // remaining principal 20000; charges at month 5 and 6 = 400 + 400
    expect(s.principalRemaining).toBe(20000);
    expect(s.interestAccrued).toBe(800);
    expect(s.outstanding).toBe(20800);
  });

  it("applies payments to outstanding interest first, then principal", () => {
    // month 5 accrues 1000; a 500 payment mid-month clears interest first
    const payments = [pay(5, 500, 15)];
    const s = computeCreditState(agreement, payments, addMonths(start, 6));
    expect(s.interestPaid).toBe(500);
    expect(s.principalPaid).toBe(0);
    expect(s.principalRemaining).toBe(50000);
    // month5 charge 1000 - 500 paid = 500 left; month6 charge 1000 => 1500 interest outstanding
    expect(s.interestOutstanding).toBe(1500);
    expect(s.outstanding).toBe(51500);
  });

  it("reports grace end date and overdue status correctly", () => {
    const s = computeCreditState(agreement, [], addMonths(start, 2));
    expect(s.graceEndDate.getTime()).toBe(addMonths(start, 4).getTime());
    expect(s.inGracePeriod).toBe(true);
    expect(s.isOverdue).toBe(false);
    expect(s.interestAccrued).toBe(0);
  });

  it("stops accruing once the balance is settled", () => {
    // Pay everything off in month 5 after one interest charge
    const payments = [pay(5, 51000)]; // 50000 principal + 1000 interest from month 5
    const s = computeCreditState(agreement, payments, addMonths(start, 8));
    expect(s.outstanding).toBe(0);
    expect(s.isSettled).toBe(true);
    expect(s.interestAccrued).toBe(1000);
  });
});

describe("buildCreditPaymentLedger", () => {
  it("shows a declining running balance before interest starts", () => {
    const payments = [pay(0, 10000), pay(2, 5000), pay(3, 20000)];

    expect(buildCreditPaymentLedger(agreement, payments).map((row) => row.balanceAfter)).toEqual([
      40000,
      35000,
      15000,
    ]);
  });

  it("includes accrued interest in the balance at each payment timestamp", () => {
    const payments = [pay(5, 500, 15), pay(6, 2000, 15)];

    const ledger = buildCreditPaymentLedger(agreement, payments);

    // Month 5 posts LKR 1,000 before the first payment, which clears interest.
    expect(ledger[0]?.balanceAfter).toBe(50500);
    // Month 6 posts another LKR 1,000; the second payment clears the remaining
    // interest and then reduces principal by LKR 500.
    expect(ledger[1]?.balanceAfter).toBe(49500);
  });

  it("does not let a later payment alter an earlier historical balance", () => {
    const payments = [pay(1, 10000), pay(6, 41600)];
    const ledger = buildCreditPaymentLedger(agreement, payments);

    expect(ledger[0]?.balanceAfter).toBe(40000);
    expect(ledger[1]?.balanceAfter).toBe(0);
  });
});
