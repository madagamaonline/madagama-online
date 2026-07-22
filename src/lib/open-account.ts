import { round2 } from "@/lib/utils";

export const OPEN_ACCOUNT_USER_PAYMENT_METHODS = ["CASH", "BANK", "CHEQUE", "CARD"] as const;
export type OpenAccountPaymentMethod = (typeof OPEN_ACCOUNT_USER_PAYMENT_METHODS)[number] | "RETURN";

export type OpenAccountPaymentLike = { amount: number; method: string };

export function computeOpenAccountState(
  principal: number,
  payments: OpenAccountPaymentLike[],
  dueDate?: Date | null,
  asOf = new Date(),
) {
  const credited = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const cashCollected = round2(
    payments.filter((payment) => payment.method !== "RETURN").reduce((sum, payment) => sum + payment.amount, 0),
  );
  const returnCredits = round2(credited - cashCollected);
  const outstanding = round2(Math.max(0, principal - credited));
  const isSettled = outstanding === 0;
  const isOverdue = !isSettled && Boolean(dueDate && startOfColomboDay(asOf) > startOfColomboDay(dueDate!));
  return { principal: round2(principal), credited, cashCollected, returnCredits, outstanding, isSettled, isOverdue };
}

export function openAccountInvoiceStatus(principal: number, credited: number): "CREDIT" | "PARTIAL" | "PAID" {
  if (credited <= 0) return "CREDIT";
  return credited >= principal ? "PAID" : "PARTIAL";
}

export function openAccountStatusLabel(status: "CREDIT" | "PARTIAL" | "PAID"): string {
  return status === "CREDIT" ? "UNPAID" : status === "PARTIAL" ? "PARTIAL" : "PAID";
}

export function invoiceTypeLabel(type: string): string {
  return type === "OPEN_ACCOUNT" ? "PAY LATER" : type === "CREDIT" ? "FORMAL CREDIT" : "CASH";
}

function startOfColomboDay(date: Date): number {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return Date.parse(`${day}T00:00:00+05:30`);
}
