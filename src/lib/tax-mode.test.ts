import { describe, expect, it } from "vitest";
import {
  activeInvoiceWhere,
  invoiceTaxableWhere,
  productTaxableWhere,
  purchaseTaxableWhere,
  supplierReturnTaxableWhere,
} from "./tax-mode";

describe("retired tax-mode compatibility", () => {
  it.each([true, false])("never hides either classification when the legacy value is %s", (legacyValue) => {
    expect(productTaxableWhere(legacyValue)).toEqual({});
    expect(purchaseTaxableWhere(legacyValue)).toEqual({});
    expect(supplierReturnTaxableWhere(legacyValue)).toEqual({});
    expect(invoiceTaxableWhere(legacyValue)).toEqual({});
    expect(activeInvoiceWhere(legacyValue)).toEqual({ voidedAt: null });
  });
});
