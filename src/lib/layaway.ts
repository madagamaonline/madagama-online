import { round2 } from "@/lib/utils";

export type LayawayLifecycleStatus = "ACTIVE" | "PAID_AWAITING_PICKUP" | "RELEASED" | "CANCELLED";

export function layawayTotals(lines: { qty: number; unitPrice: number }[], discount = 0) {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0));
  const safeDiscount = round2(Math.max(0, Math.min(discount, subtotal)));
  return { subtotal, discount: safeDiscount, total: round2(subtotal - safeDiscount) };
}

export function layawayBalance(total: number, collected: number) {
  return Math.max(0, round2(total - collected));
}

export function validateLayawayPayment(amount: number, outstanding: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than zero.";
  if (round2(amount) > round2(outstanding)) return "Payment cannot exceed the outstanding balance.";
  return null;
}

export function statusAfterCollection(total: number, collected: number): LayawayLifecycleStatus {
  return round2(collected) >= round2(total) ? "PAID_AWAITING_PICKUP" : "ACTIVE";
}

export function canHandover(status: LayawayLifecycleStatus, total: number, collected: number) {
  return status === "PAID_AWAITING_PICKUP" && layawayBalance(total, collected) === 0;
}
