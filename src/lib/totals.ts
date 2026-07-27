import { round2 } from "./utils";

export type Totals = {
  subtotal: number;
  productDiscount: number;
  billDiscount: number;
  discount: number;
  grandTotal: number;
};

/** Sums gross line totals, then applies product and bill discounts. */
export function sumLines(
  lines: { qty: number; unitPrice: number; unitDiscount?: number }[],
  billDiscount = 0,
): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const productDiscount = round2(
    lines.reduce((s, l) => s + l.qty * Math.min(l.unitPrice, Math.max(0, l.unitDiscount ?? 0)), 0),
  );
  const netBeforeBillDiscount = round2(Math.max(0, subtotal - productDiscount));
  const appliedBillDiscount = round2(Math.min(Math.max(0, billDiscount), netBeforeBillDiscount));
  return {
    subtotal,
    productDiscount,
    billDiscount: appliedBillDiscount,
    discount: round2(productDiscount + appliedBillDiscount),
    grandTotal: round2(netBeforeBillDiscount - appliedBillDiscount),
  };
}
