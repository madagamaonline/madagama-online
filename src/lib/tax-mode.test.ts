import { describe, expect, it } from "vitest";
import {
  purchaseTaxableWhere,
  supplierReturnTaxableWhere,
} from "./tax-mode";

describe("purchase tax-mode visibility", () => {
  it("does not constrain purchases or supplier returns when non-taxable mode is enabled", () => {
    expect(purchaseTaxableWhere(true)).toEqual({});
    expect(supplierReturnTaxableWhere(true)).toEqual({});
  });

  it("requires every product line to be taxable in taxable-only mode", () => {
    const lineFilter = { items: { every: { product: { taxable: true } } } };

    expect(purchaseTaxableWhere(false)).toEqual(lineFilter);
    expect(supplierReturnTaxableWhere(false)).toEqual(lineFilter);
  });
});
