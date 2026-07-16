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

  it("posts five months of interest at the end of month 5, then 2% monthly", () => {
    const justBeforeMonth5 = computeCreditState(agreement, [], addDays(addMonths(start, 5), -1));
    expect(justBeforeMonth5.interestAccrued).toBe(0);

    const s5 = computeCreditState(agreement, [], addMonths(start, 5));
    expect(s5.interestAccrued).toBe(5000);
    expect(s5.outstanding).toBe(55000);

    // Month 6 adds one ordinary 2% charge on principal only.
    const s6 = computeCreditState(agreement, [], addMonths(start, 6));
    expect(s6.interestAccrued).toBe(6000);
    expect(s6.outstanding).toBe(56000);

    // Month 7 adds another 1000; the unpaid interest never compounds.
    const s7 = computeCreditState(agreement, [], addMonths(start, 7));
    expect(s7.interestAccrued).toBe(7000);
    expect(s7.outstanding).toBe(57000);
    expect(s7.isOverdue).toBe(true);
  });

  it("charges interest on the reduced principal after a payment", () => {
    const payments = [pay(2, 30000)]; // pay 30k in month 2
    const s = computeCreditState(agreement, payments, addMonths(start, 6));
    // remaining principal 20000; month 5 catches up 5 × 400, month 6 adds 400
    expect(s.principalRemaining).toBe(20000);
    expect(s.interestAccrued).toBe(2400);
    expect(s.outstanding).toBe(22400);
  });

  it("applies payments to outstanding interest first, then principal", () => {
    // month 5 accrues 5000; a 500 payment mid-month clears interest first
    const payments = [pay(5, 500, 15)];
    const s = computeCreditState(agreement, payments, addMonths(start, 6));
    expect(s.interestPaid).toBe(500);
    expect(s.principalPaid).toBe(0);
    expect(s.principalRemaining).toBe(50000);
    // month5 charge 5000 - 500 paid = 4500 left; month6 adds 1000
    expect(s.interestOutstanding).toBe(5500);
    expect(s.outstanding).toBe(55500);
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
    const payments = [pay(5, 55000)]; // 50000 principal + the month-5 catch-up charge
    const s = computeCreditState(agreement, payments, addMonths(start, 8));
    expect(s.outstanding).toBe(0);
    expect(s.isSettled).toBe(true);
    expect(s.interestAccrued).toBe(5000);
  });

  it("records a settlement discount separately from cash and closes the account", () => {
    const sale = { ...agreement, principal: 115000 };
    const payments = [
      { amount: 90000, paidDate: start },
      { amount: 9000, discount: 16000, paidDate: addDays(start, 3) },
    ];

    const state = computeCreditState(sale, payments, addDays(start, 3));
    expect(state.totalPaid).toBe(99000);
    expect(state.principalPaid).toBe(99000);
    expect(state.principalDiscount).toBe(16000);
    expect(state.totalDiscount).toBe(16000);
    expect(state.outstanding).toBe(0);
    expect(state.isSettled).toBe(true);
  });

  it("applies a settlement discount after cash and waives interest before principal", () => {
    const payments = [{ amount: 2000, discount: 4000, paidDate: addMonths(start, 5) }];
    const state = computeCreditState(agreement, payments, addMonths(start, 5));

    expect(state.interestPaid).toBe(2000);
    expect(state.interestDiscount).toBe(3000);
    expect(state.principalDiscount).toBe(1000);
    expect(state.principalRemaining).toBe(49000);
    expect(state.outstanding).toBe(49000);
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

    // Month 5 posts the LKR 5,000 catch-up before the first payment.
    expect(ledger[0]?.balanceAfter).toBe(54500);
    // Month 6 posts another LKR 1,000; both payments are still absorbed by
    // outstanding interest, so principal remains unchanged.
    expect(ledger[1]?.balanceAfter).toBe(53500);
    expect(ledger.map((row) => row.principalApplied)).toEqual([0, 0]);
    expect(ledger.map((row) => row.interestApplied)).toEqual([500, 2000]);
  });

  it("does not let a later payment alter an earlier historical balance", () => {
    const payments = [pay(1, 10000), pay(6, 44800)];
    const ledger = buildCreditPaymentLedger(agreement, payments);

    expect(ledger[0]?.balanceAfter).toBe(40000);
    expect(ledger[1]?.balanceAfter).toBe(0);
  });
});
