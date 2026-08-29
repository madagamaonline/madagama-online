import { describe, expect, it } from "vitest";
import { aggregateSupplierSales, reportBounds } from "./supplier-sales-analytics";
import type { SupplierSalesDetailRow } from "./supplier-sales";
import { addDays, businessDayKey } from "./dates";

const base: SupplierSalesDetailRow = {
  kind: "SALE", date: new Date("2026-08-10T06:00:00Z"), invoiceNumber: "INV-1", invoiceId: "i1",
  supplierId: "s1", supplierName: "Supplier One", attribution: "CAPTURED", productId: "p1",
  productCode: "P-1", productName: "Pump", quantity: 2, unit: "EACH", sales: 1000, returns: 0,
  cogs: 600, returnedCogs: 0, customerName: "Customer", cashierName: "Cashier", salespersonName: "Seller", saleType: "CASH",
};

describe("aggregateSupplierSales", () => {
  it("keeps quantities by unit and nets returns on their activity day", () => {
    const returned: SupplierSalesDetailRow = { ...base, kind: "RETURN", date: new Date("2026-08-11T06:00:00Z"), quantity: -1, sales: 0, returns: 500, cogs: 0, returnedCogs: 300 };
    const metre: SupplierSalesDetailRow = { ...base, productId: "p2", productCode: "W-1", productName: "Wire", unit: "METER", quantity: 2.5, sales: 250, cogs: 100 };
    const result = aggregateSupplierSales([base, returned, metre]);
    expect(result.sold.EACH).toBe(2);
    expect(result.sold.METER).toBe(2.5);
    expect(result.returned.EACH).toBe(1);
    expect(result.products.find((row) => row.productId === "p1")).toMatchObject({ netQuantity: 1, netSales: 500, netCogs: 300, grossProfit: 200 });
    expect(result.daily).toHaveLength(2);
    expect(result.daily[1]).toMatchObject({ netSales: -500, netCogs: -300, grossProfit: -200 });
  });
});

describe("reportBounds", () => {
  const now = new Date("2026-08-29T06:00:00Z");

  it("falls back to the whole business month when no range is given", () => {
    const bounds = reportBounds("2026-07", {}, now);
    expect([bounds.from, bounds.to]).toEqual(["2026-07-01", "2026-07-31"]);
  });

  it("honours an explicit inclusive range", () => {
    const bounds = reportBounds(null, { from: "2026-08-03", to: "2026-08-05" }, now);
    expect([bounds.from, bounds.to]).toEqual(["2026-08-03", "2026-08-05"]);
    expect(businessDayKey(addDays(bounds.end, -1))).toBe("2026-08-05");
  });

  it("clamps future dates to today and un-reverses a backwards range", () => {
    expect(reportBounds(null, { from: "2026-08-10", to: "2027-01-01" }, now).to).toBe("2026-08-29");
    const flipped = reportBounds(null, { from: "2026-08-20", to: "2026-08-10" }, now);
    expect([flipped.from, flipped.to]).toEqual(["2026-08-10", "2026-08-20"]);
  });

  it("ignores malformed days, then clamps the current month to today", () => {
    const bounds = reportBounds("2026-08", { from: "not-a-date", to: "2026-02-30" }, now);
    expect([bounds.from, bounds.to]).toEqual(["2026-08-01", "2026-08-29"]);
  });

  it("treats a single day as an inclusive one-day window", () => {
    const bounds = reportBounds(null, { from: "2026-08-12", to: "2026-08-12" }, now);
    expect(bounds.from).toBe(bounds.to);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
