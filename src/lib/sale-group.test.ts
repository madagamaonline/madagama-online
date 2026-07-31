import { describe, expect, it } from "vitest";
import { orderSaleGroupInvoices, summarizeSaleGroup } from "./sale-group";

describe("sale group receipt aggregation", () => {
  it("orders taxable before non-taxable and sums persisted totals", () => {
    const invoices = [
      {
        taxCategory: "NON_TAXABLE" as const,
        subtotal: 100,
        discount: 10,
        grandTotal: 90,
        amountPaid: 90,
        voidedAt: null,
        items: [{ qty: 1, unitDiscount: 5 }],
      },
      {
        taxCategory: "TAXABLE" as const,
        subtotal: 200,
        discount: 20,
        grandTotal: 180,
        amountPaid: 180,
        voidedAt: null,
        items: [{ qty: 2, unitDiscount: 5 }],
      },
    ];

    expect(orderSaleGroupInvoices(invoices).map((invoice) => invoice.taxCategory)).toEqual([
      "TAXABLE",
      "NON_TAXABLE",
    ]);
    expect(summarizeSaleGroup(invoices)).toEqual({
      subtotal: 300,
      productDiscount: 15,
      billDiscount: 15,
      discount: 30,
      grandTotal: 270,
      amountPaid: 270,
      activeGrandTotal: 270,
      voidStatus: "ACTIVE",
    });
  });

  it("reports partial and complete void states without changing the original total", () => {
    const base = {
      subtotal: 100,
      discount: 0,
      grandTotal: 100,
      amountPaid: 100,
      items: [{ qty: 1, unitDiscount: 0 }],
    };
    const partiallyVoided = [
      { ...base, taxCategory: "TAXABLE" as const, voidedAt: new Date() },
      { ...base, taxCategory: "NON_TAXABLE" as const, voidedAt: null },
    ];

    expect(summarizeSaleGroup(partiallyVoided)).toMatchObject({
      grandTotal: 200,
      activeGrandTotal: 100,
      voidStatus: "PARTIALLY_VOIDED",
    });
    expect(
      summarizeSaleGroup(partiallyVoided.map((invoice) => ({ ...invoice, voidedAt: new Date() }))),
    ).toMatchObject({
      grandTotal: 200,
      activeGrandTotal: 0,
      voidStatus: "VOIDED",
    });
  });
});
