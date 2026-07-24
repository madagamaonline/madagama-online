import { round2 } from "@/lib/utils";
import { businessDayKey } from "@/lib/dates";

export type ChequeStatus = "UPCOMING" | "DUE" | "OVERDUE" | "SETTLED";

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

export function validateChequePayment(amount: number, remaining: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount";
  if (round2(amount) > round2(remaining)) return "Payment cannot exceed the cheque balance";
  return null;
}
