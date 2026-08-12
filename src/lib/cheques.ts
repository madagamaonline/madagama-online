import { round2 } from "@/lib/utils";
import { businessDayKey } from "@/lib/dates";

export type ChequeStatus = "UPCOMING" | "DUE" | "OVERDUE" | "SETTLED";
export type ChequeVoidKind = "STOPPED" | "BOUNCED" | "CANCELLED";
/** Full lifecycle of a cheque: live states plus the terminal void states. */
export type ChequeState = ChequeStatus | ChequeVoidKind;

export function chequeBalance(amount: number, payments: number[]): number {
  return Math.max(0, round2(amount - payments.reduce((sum, payment) => sum + payment, 0)));
}

export function chequeStatus(dueDate: Date, remaining: number, now = new Date()): ChequeStatus {
  if (remaining <= 0) return "SETTLED";
  const dueKey = businessDayKey(dueDate);
  const todayKey = businessDayKey(now);
  if (dueKey < todayKey) return "OVERDUE";
  if (dueKey === todayKey) return "DUE";
  return "UPCOMING";
}

/**
 * A voided cheque is frozen — its due date stops mattering the moment it is
 * stopped, bounced or cancelled, so the void kind wins over the date/settlement.
 */
export function chequeState(
  cheque: { dueDate: Date; voidKind?: ChequeVoidKind | null },
  remaining: number,
  now = new Date(),
): ChequeState {
  if (cheque.voidKind) return cheque.voidKind;
  return chequeStatus(cheque.dueDate, remaining, now);
}

export function isVoidState(state: ChequeState): state is ChequeVoidKind {
  return state === "STOPPED" || state === "BOUNCED" || state === "CANCELLED";
}

/** Live = still a real commitment against the bank account. Voids are not exposure. */
export function isLiveCheque(cheque: { voidedAt?: Date | null }, remaining: number): boolean {
  return !cheque.voidedAt && remaining > 0;
}

export const chequeStateLabel: Record<ChequeState, string> = {
  UPCOMING: "Upcoming",
  DUE: "Due today",
  OVERDUE: "Overdue",
  SETTLED: "Cleared",
  STOPPED: "Stopped",
  BOUNCED: "Bounced",
  CANCELLED: "Cancelled",
};

export const chequeStateTone: Record<ChequeState, "amber" | "red" | "green" | "gray"> = {
  UPCOMING: "amber",
  DUE: "amber",
  OVERDUE: "red",
  SETTLED: "green",
  STOPPED: "red",
  BOUNCED: "red",
  CANCELLED: "gray",
};

export const VOID_KINDS = ["STOPPED", "BOUNCED", "CANCELLED"] as const;

export const voidKindLabel: Record<ChequeVoidKind, string> = {
  STOPPED: "Stop payment",
  BOUNCED: "Bounced / dishonoured",
  CANCELLED: "Cancelled (never handed over)",
};

export function validateChequePayment(amount: number, remaining: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount";
  if (round2(amount) > round2(remaining)) return "Payment cannot exceed the cheque balance";
  return null;
}
