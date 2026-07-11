import { round2 } from "./utils";

export type SoldLine = { productId: string | null; qty: number; unitPrice: number };
export type ReturnedLine = { productId: string; qty: number };

export function assertUniqueProductLines(lines: { productId: string }[]): void {
  const ids = new Set<string>();
  for (const line of lines) {
    if (ids.has(line.productId)) throw new Error("DUPLICATE_PRODUCT");
    ids.add(line.productId);
  }
}

export function remainingReturnableByProduct(
  sold: SoldLine[],
  returned: ReturnedLine[],
): Map<string, { qty: number; unitPrice: number }> {
  const result = new Map<string, { qty: number; unitPrice: number }>();
  for (const line of sold) {
    if (!line.productId) continue;
    const current = result.get(line.productId);
    if (current && current.unitPrice !== line.unitPrice) throw new Error("AMBIGUOUS_SALE_PRICE");
    result.set(line.productId, {
      qty: (current?.qty ?? 0) + line.qty,
      unitPrice: line.unitPrice,
    });
  }
  for (const line of returned) {
    const current = result.get(line.productId);
    if (current) current.qty -= line.qty;
  }
  return result;
}

export function validatePaymentAmount(amount: number, outstanding: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount";
  if (round2(outstanding) <= 0) return "This balance is already settled.";
  if (round2(amount) > round2(outstanding)) {
    return `Payment exceeds the outstanding balance of LKR ${round2(outstanding).toFixed(2)}.`;
  }
  return null;
}

export function isRecentDuplicatePayment(
  existing: {
    amount: number;
    paidDate: Date;
    method: string;
    note: string | null;
    recordedByUserId: string | null;
    createdAt: Date;
  }[],
  candidate: {
    amount: number;
    paidDate: Date;
    method: string;
    note: string | null;
    recordedByUserId: string;
  },
  now = new Date(),
): boolean {
  const cutoff = now.getTime() - 30_000;
  return existing.some(
    (payment) =>
      payment.createdAt.getTime() >= cutoff &&
      round2(payment.amount) === round2(candidate.amount) &&
      payment.paidDate.getTime() === candidate.paidDate.getTime() &&
      payment.method === candidate.method &&
      payment.note === candidate.note &&
      payment.recordedByUserId === candidate.recordedByUserId,
  );
}
