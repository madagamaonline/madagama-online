import { addMonths, differenceInCalendarMonths } from "date-fns";
import { round2 } from "./utils";

export type AgreementInput = {
  principal: number;
  startDate: Date;
  interestRatePerMonth: number; // e.g. 0.02
  interestFreeMonths: number; // e.g. 4
};

export type PaymentInput = { amount: number; paidDate: Date };

export type CreditState = {
  principal: number;
  principalRemaining: number;
  interestAccrued: number; // total interest ever charged
  interestOutstanding: number; // unpaid interest
  interestPaid: number;
  principalPaid: number;
  totalPaid: number;
  outstanding: number; // principalRemaining + interestOutstanding
  monthsElapsed: number;
  inGracePeriod: boolean;
  graceEndDate: Date;
  nextChargeDate: Date | null; // when the next interest charge would post
  isSettled: boolean;
  isOverdue: boolean; // past grace and still owing
};

type Event =
  | { date: Date; kind: "pay"; amount: number; order: 1 }
  | { date: Date; kind: "accrue"; order: 0 };

/**
 * Computes the live state of a credit agreement.
 *
 * Rules (confirmed with the business):
 *  - No interest during the first `interestFreeMonths` months.
 *  - After grace, 2% (configurable) per month is charged on the REMAINING
 *    PRINCIPAL only — interest never earns interest (non-compounding).
 *  - Payments are flexible amounts on any date; each payment clears
 *    outstanding interest first, then reduces principal.
 */
export function computeCreditState(
  agreement: AgreementInput,
  payments: PaymentInput[],
  asOf: Date = new Date(),
): CreditState {
  const { principal, startDate, interestRatePerMonth, interestFreeMonths } = agreement;
  const graceEndDate = addMonths(startDate, interestFreeMonths);

  // Build the event timeline up to `asOf`.
  const events: Event[] = [];
  for (const p of payments) {
    if (p.paidDate <= asOf && p.amount > 0) {
      events.push({ date: p.paidDate, kind: "pay", amount: p.amount, order: 1 });
    }
  }
  // Interest posts at each monthly anniversary after the grace period.
  for (let k = interestFreeMonths + 1; ; k++) {
    const anniversary = addMonths(startDate, k);
    if (anniversary > asOf) break;
    events.push({ date: anniversary, kind: "accrue", order: 0 });
  }

  // On the same date, that month's interest posts before the payment is applied.
  events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);

  let principalRemaining = round2(principal);
  let interestOutstanding = 0;
  let interestAccrued = 0;
  let interestPaid = 0;
  let principalPaid = 0;

  for (const ev of events) {
    if (ev.kind === "pay") {
      const toInterest = Math.min(ev.amount, interestOutstanding);
      interestOutstanding = round2(interestOutstanding - toInterest);
      interestPaid = round2(interestPaid + toInterest);
      const rem = round2(ev.amount - toInterest);
      const toPrincipal = Math.min(rem, principalRemaining);
      principalRemaining = round2(principalRemaining - toPrincipal);
      principalPaid = round2(principalPaid + toPrincipal);
    } else {
      if (principalRemaining > 0) {
        const charge = round2(interestRatePerMonth * principalRemaining);
        interestOutstanding = round2(interestOutstanding + charge);
        interestAccrued = round2(interestAccrued + charge);
      }
    }
  }

  const outstanding = round2(principalRemaining + interestOutstanding);
  const monthsElapsed = Math.max(0, differenceInCalendarMonths(asOf, startDate));
  const isSettled = outstanding <= 0;
  const inGracePeriod = monthsElapsed < interestFreeMonths && !isSettled;
  const isOverdue = !isSettled && monthsElapsed >= interestFreeMonths;

  // Next charge date: the first anniversary strictly after asOf, but not before grace ends.
  let nextChargeDate: Date | null = null;
  if (!isSettled) {
    for (let k = interestFreeMonths + 1; ; k++) {
      const anniversary = addMonths(startDate, k);
      if (anniversary > asOf) {
        nextChargeDate = anniversary;
        break;
      }
      if (k > interestFreeMonths + 600) break; // safety
    }
  }

  return {
    principal: round2(principal),
    principalRemaining,
    interestAccrued,
    interestOutstanding,
    interestPaid,
    principalPaid,
    totalPaid: round2(interestPaid + principalPaid),
    outstanding,
    monthsElapsed,
    inGracePeriod,
    graceEndDate,
    nextChargeDate,
    isSettled,
    isOverdue,
  };
}
