import { describe, expect, it } from "vitest";
import { voidEligibilityError, voidInvoiceSchema } from "./invoice-void";
import { activeInvoiceWhere } from "./tax-mode";

const eligible = { returns: 0, serviceJobs: 0, missingProducts: 0, payments: 0, interestCharges: 0, closedShift: false };

describe("voidInvoiceSchema", () => {
  it("trims and accepts a useful reason", () => {
    expect(voidInvoiceSchema.parse({ invoiceId: "inv", reason: "  Entered twice  " }).reason).toBe("Entered twice");
  });
  it("rejects short and excessive reasons", () => {
    expect(voidInvoiceSchema.safeParse({ invoiceId: "inv", reason: " x " }).success).toBe(false);
    expect(voidInvoiceSchema.safeParse({ invoiceId: "inv", reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("activeInvoiceWhere", () => {
  it("always excludes voids and composes tax visibility", () => {
    expect(activeInvoiceWhere(true)).toEqual({ voidedAt: null });
    expect(activeInvoiceWhere(false)).toEqual({ taxCategory: "TAXABLE", voidedAt: null });
  });
});

describe("voidEligibilityError", () => {
  it("allows an untouched invoice", () => expect(voidEligibilityError(eligible)).toBeNull());
  it.each([
    [{ ...eligible, returns: 1 }, "sales return"],
    [{ ...eligible, serviceJobs: 1 }, "service or warranty"],
    [{ ...eligible, missingProducts: 1 }, "link to a product"],
    [{ ...eligible, payments: 1 }, "payment or interest"],
    [{ ...eligible, interestCharges: 1 }, "payment or interest"],
    [{ ...eligible, closedShift: true }, "completed shift"],
  ])("rejects a blocker", (state, message) => expect(voidEligibilityError(state)).toContain(message));
});
