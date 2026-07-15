import { round2 } from "./utils";

// All month/anniversary math is anchored to Asia/Colombo (a fixed UTC+05:30, no
// DST since 2006), NOT the server's process timezone (UTC on Vercel). Without
// this, an anniversary falls at the UTC wall-time of the original sale and a
// payment can land on the wrong side of the interest-accrual boundary by up to
// 5.5 hours. These helpers are deterministic regardless of where the code runs.
const BIZ_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** Add whole months in the Colombo calendar (clamping Jan 31 + 1mo → Feb 28),
 *  returning the UTC instant at the same Colombo wall-clock time as `instant`. */
function addBusinessMonths(instant: Date, months: number): Date {
  const local = new Date(instant.getTime() + BIZ_OFFSET_MS); // Colombo clock as UTC fields
  const monthAbs = local.getUTCMonth() + months;
  const targetYear = local.getUTCFullYear() + Math.floor(monthAbs / 12);
  const targetMonth = ((monthAbs % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(local.getUTCDate(), lastDay);
  const result = Date.UTC(
    targetYear,
    targetMonth,
    day,
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  );
  return new Date(result - BIZ_OFFSET_MS);
}

/** Whole calendar-month difference (`a - b`) in the Colombo calendar. */
function businessMonthDiff(a: Date, b: Date): number {
  const la = new Date(a.getTime() + BIZ_OFFSET_MS);
  const lb = new Date(b.getTime() + BIZ_OFFSET_MS);
  return (la.getUTCFullYear() - lb.getUTCFullYear()) * 12 + (la.getUTCMonth() - lb.getUTCMonth());
}

export type AgreementInput = {
  principal: number;
  startDate: Date;
  interestRatePerMonth: number; // e.g. 0.02
  interestFreeMonths: number; // e.g. 4
};

export type PaymentInput = { amount: number; paidDate: Date };

export type CreditPaymentLedgerEntry = PaymentInput & {
  balanceAfter: number;
};

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
  const graceEndDate = addBusinessMonths(startDate, interestFreeMonths);

  // Build the event timeline up to `asOf`.
  const events: Event[] = [];
  for (const p of payments) {
    if (p.paidDate <= asOf && p.amount > 0) {
      events.push({ date: p.paidDate, kind: "pay", amount: p.amount, order: 1 });
    }
  }
  // Interest posts at each monthly anniversary after the grace period.
  for (let k = interestFreeMonths + 1; ; k++) {
    const anniversary = addBusinessMonths(startDate, k);
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
  const monthsElapsed = Math.max(0, businessMonthDiff(asOf, startDate));
  const isSettled = outstanding <= 0;
  const inGracePeriod = monthsElapsed < interestFreeMonths && !isSettled;
  const isOverdue = !isSettled && monthsElapsed >= interestFreeMonths;

  // Next charge date: the first anniversary strictly after asOf, but not before grace ends.
  let nextChargeDate: Date | null = null;
  if (!isSettled) {
    for (let k = interestFreeMonths + 1; ; k++) {
      const anniversary = addBusinessMonths(startDate, k);
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

/**
 * Builds the customer-facing payment trail for a credit account.
 *
 * Each balance is evaluated at that payment's exact timestamp and only with
 * payments visible up to that row. This is important once interest has begun:
 * a historical row must include charges posted by then, without including any
 * later installment. Callers should supply payments in display order (normally
 * paidDate, then creation order for ties).
 */
export function buildCreditPaymentLedger(
  agreement: AgreementInput,
  payments: PaymentInput[],
): CreditPaymentLedgerEntry[] {
  const paymentsSoFar: PaymentInput[] = [];

  return payments.map((payment) => {
    paymentsSoFar.push(payment);
    return {
      ...payment,
      balanceAfter: computeCreditState(
        agreement,
        paymentsSoFar,
        payment.paidDate,
      ).outstanding,
    };
  });
}
