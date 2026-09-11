import { computeCreditState, type AgreementInput, type PaymentInput } from "./credit";
import { businessDayKey } from "./dates";
import { round2 } from "./utils";

/** Re-evaluate every payment after inserting a backdated entry. The credit
 * engine caps allocations; any unallocated money is an overpayment, not income.
 */
export function validateCreditPaymentTimeline(
  terms: AgreementInput, existing: PaymentInput[], candidate: PaymentInput, now = new Date(),
): string | null {
  if (!Number.isFinite(candidate.paidDate.getTime())) return "Enter a valid payment date.";
  if (businessDayKey(candidate.paidDate) < businessDayKey(terms.startDate)) return "Payment cannot precede the sale date.";
  if (candidate.paidDate > now) return "Payment cannot be dated in the future.";
  const payments = [...existing, candidate];
  // Older application versions accepted future-dated receipts. Include those
  // when checking excess money, but callers still compute today's status as of now.
  const horizon = new Date(Math.max(now.getTime(), ...existing.map((p) => p.paidDate.getTime())));
  const state = computeCreditState(terms, payments, horizon);
  const tendered = round2(payments.reduce((sum, p) => sum + p.amount + (p.discount ?? 0), 0));
  const applied = round2(state.principalPaid + state.interestPaid + state.principalDiscount + state.interestDiscount);
  return tendered > applied ? "This payment would overpay the account after all dated payments and discounts are recalculated." : null;
}
