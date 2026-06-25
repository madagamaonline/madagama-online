import { round2 } from "./utils";

export type Totals = { subtotal: number; discount: number; grandTotal: number };

/** Sums line totals and applies a discount. No tax — Madagama is not VAT-registered. */
export function sumLines(
  lines: { qty: number; unitPrice: number }[],
  discount = 0,
): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  return {
    subtotal,
    discount: round2(discount),
    grandTotal: round2(Math.max(0, subtotal - discount)),
  };
}
