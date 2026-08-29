import { describe, expect, it } from "vitest";
import { allocateInvoiceTotal } from "./supplier-sales-math";

describe("allocateInvoiceTotal", () => {
  it("allocates invoice discounts proportionally and reconciles the remainder", () => {
    const rows = allocateInvoiceTotal([100, 50, 25], 157.49);
    expect(rows).toEqual([89.99, 45, 22.5]);
    expect(rows.reduce((sum, value) => sum + value, 0)).toBe(157.49);
  });

  it("keeps a zero-value invoice fully reconciled", () => {
    expect(allocateInvoiceTotal([0, 0], 0)).toEqual([0, 0]);
  });
});
