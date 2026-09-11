import { round2 } from "./utils";
import { roundQuantity } from "./units";

type SoldItem = { productId: string | null; qty: number; unitPrice: number; unitDiscount: number; unit: string };
type PreviousReturn = { totalRefund: number; items: { productId: string; qty: number; lineTotal: number }[] };
export type ReturnAllowance = { qty: number; value: number; unit: string };

/** Allocate the amount actually charged, in cents, before subtracting prior returns.
 * Legacy returns are never rewritten; an old over-refund cannot authorize more money.
 */
export function customerReturnAllowances(
  grandTotal: number, items: SoldItem[], previous: PreviousReturn[],
): Map<string, ReturnAllowance> {
  const grouped = new Map<string, { qty: number; weight: number; unit: string }>();
  for (const item of items) {
    const key = item.productId ?? "";
    const current = grouped.get(key) ?? { qty: 0, weight: 0, unit: item.unit };
    if (current.unit !== item.unit) throw new Error("Invoice contains inconsistent units for a product.");
    current.qty = roundQuantity(current.qty + item.qty);
    current.weight += item.qty * Math.max(0, item.unitPrice - item.unitDiscount);
    grouped.set(key, current);
  }
  let cents = Math.round(round2(grandTotal) * 100);
  let weight = [...grouped.values()].reduce((sum, item) => sum + item.weight, 0);
  const result = new Map<string, ReturnAllowance>();
  for (const [id, item] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const allocated = weight > 0 ? Math.min(cents, Math.round(cents * item.weight / weight)) : 0;
    cents -= allocated;
    weight -= item.weight;
    const returned = previous.flatMap((r) => r.items).filter((r) => r.productId === id);
    if (id) result.set(id, {
      qty: Math.max(0, roundQuantity(item.qty - returned.reduce((sum, r) => sum + r.qty, 0))),
      value: Math.max(0, round2(allocated / 100 - returned.reduce((sum, r) => sum + r.lineTotal, 0))),
      unit: item.unit,
    });
  }
  // Old returns can exceed their per-product share. Cap all remaining allowances
  // together to the remaining invoice value, including returns with missing items.
  let budget = Math.max(0, Math.round(round2(grandTotal - previous.reduce((sum, r) => sum + r.totalRefund, 0)) * 100));
  let remaining = [...result.values()].reduce((sum, r) => sum + Math.round(r.value * 100), 0);
  for (const allowance of result.values()) {
    const original = Math.round(allowance.value * 100);
    const allocated = remaining > 0 ? Math.min(original, budget, Math.round(budget * original / remaining)) : 0;
    allowance.value = allocated / 100;
    budget -= allocated;
    remaining -= original;
  }
  return result;
}

export function returnLineValue(allowance: ReturnAllowance, qty: number): number {
  if (!Number.isFinite(qty) || qty <= 0 || qty > allowance.qty || roundQuantity(qty) !== qty) {
    throw new Error("Enter a return quantity within the remaining quantity, with at most four decimal places.");
  }
  if (allowance.unit === "EACH" && !Number.isInteger(qty)) throw new Error("Piece products must be returned in whole quantities.");
  return round2(allowance.value * qty / allowance.qty);
}

export function supplierReturnAllowances(
  items: { productId: string; qty: number; costPrice: number; unit: string }[],
  previous: { productId: string; qty: number; lineTotal: number }[],
): Map<string, ReturnAllowance> {
  const result = new Map<string, ReturnAllowance>();
  for (const item of items) {
    const current = result.get(item.productId) ?? { qty: 0, value: 0, unit: item.unit };
    if (current.unit !== item.unit) throw new Error("Purchase contains inconsistent units for a product.");
    current.qty = roundQuantity(current.qty + item.qty);
    current.value = round2(current.value + item.qty * item.costPrice);
    result.set(item.productId, current);
  }
  for (const item of previous) {
    const current = result.get(item.productId);
    if (current) {
      current.qty = Math.max(0, roundQuantity(current.qty - item.qty));
      current.value = Math.max(0, round2(current.value - item.lineTotal));
    }
  }
  return result;
}
