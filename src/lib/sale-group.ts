import type { TaxCategory } from "@prisma/client";
import { round2, toNum } from "./utils";

export type SaleGroupInvoiceLike = {
  taxCategory: TaxCategory;
  subtotal: number | { toString(): string };
  discount: number | { toString(): string };
  grandTotal: number | { toString(): string };
  amountPaid: number | { toString(): string };
  voidedAt: Date | null;
  items: { qty: number | { toString(): string }; unitDiscount: number | { toString(): string } }[];
};

export type SaleGroupVoidStatus = "ACTIVE" | "PARTIALLY_VOIDED" | "VOIDED";

export function orderSaleGroupInvoices<T extends { taxCategory: TaxCategory }>(invoices: T[]): T[] {
  return [...invoices].sort((a, b) => {
    if (a.taxCategory === b.taxCategory) return 0;
    return a.taxCategory === "TAXABLE" ? -1 : 1;
  });
}

export function summarizeSaleGroup(invoices: SaleGroupInvoiceLike[]) {
  const subtotal = round2(invoices.reduce((sum, invoice) => sum + toNum(invoice.subtotal), 0));
  const discount = round2(invoices.reduce((sum, invoice) => sum + toNum(invoice.discount), 0));
  const grandTotal = round2(invoices.reduce((sum, invoice) => sum + toNum(invoice.grandTotal), 0));
  const amountPaid = round2(invoices.reduce((sum, invoice) => sum + toNum(invoice.amountPaid), 0));
  const productDiscount = round2(
    invoices.reduce(
      (sum, invoice) =>
        sum + invoice.items.reduce((itemSum, item) => itemSum + toNum(item.qty) * toNum(item.unitDiscount), 0),
      0,
    ),
  );
  const billDiscount = round2(Math.max(0, discount - productDiscount));
  const activeGrandTotal = round2(
    invoices.reduce(
      (sum, invoice) => sum + (invoice.voidedAt ? 0 : toNum(invoice.grandTotal)),
      0,
    ),
  );
  const voidedCount = invoices.filter((invoice) => invoice.voidedAt).length;
  const voidStatus: SaleGroupVoidStatus =
    voidedCount === 0
      ? "ACTIVE"
      : voidedCount === invoices.length
        ? "VOIDED"
        : "PARTIALLY_VOIDED";

  return {
    subtotal,
    productDiscount,
    billDiscount,
    discount,
    grandTotal,
    amountPaid,
    activeGrandTotal,
    voidStatus,
  };
}
