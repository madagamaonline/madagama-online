import { describe, expect, it } from "vitest";
import { sumLines } from "./totals";

describe("sumLines product discounts", () => {
  it("keeps a gross subtotal and applies per-unit and bill discounts separately", () => {
    expect(
      sumLines(
        [
          { qty: 2, unitPrice: 100, unitDiscount: 10 },
          { qty: 1, unitPrice: 50 },
        ],
        5,
      ),
    ).toEqual({
      subtotal: 250,
      productDiscount: 20,
      billDiscount: 5,
      discount: 25,
      grandTotal: 225,
    });
  });

  it("remains backward compatible when unitDiscount is omitted", () => {
    expect(sumLines([{ qty: 2, unitPrice: 100 }], 20)).toEqual({
      subtotal: 200,
      productDiscount: 0,
      billDiscount: 20,
      discount: 20,
      grandTotal: 180,
    });
  });

  it("caps discounts defensively so totals cannot become negative", () => {
    expect(sumLines([{ qty: 1, unitPrice: 100, unitDiscount: 150 }], 50)).toEqual({
      subtotal: 100,
      productDiscount: 100,
      billDiscount: 0,
      discount: 100,
      grandTotal: 0,
    });
  });
});
