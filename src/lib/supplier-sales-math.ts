import { round2 } from "@/lib/utils";

/** Allocate an invoice's authoritative grand total across its lines exactly. */
export function allocateInvoiceTotal(lineTotals: number[], grandTotal: number): number[] {
  if (lineTotals.length === 0) return [];
  const subtotal = round2(lineTotals.reduce((sum, value) => sum + value, 0));
  if (subtotal <= 0) return lineTotals.map((_, index) => index === lineTotals.length - 1 ? round2(grandTotal) : 0);
  let allocated = 0;
  return lineTotals.map((lineTotal, index) => {
    const value = index === lineTotals.length - 1
      ? round2(grandTotal - allocated)
      : round2((grandTotal * lineTotal) / subtotal);
    allocated = round2(allocated + value);
    return value;
  });
}
