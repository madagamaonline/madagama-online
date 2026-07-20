import { describe, expect, it } from "vitest";
import {
  canTransitionVehicleDocuments,
  computeVehicleDeal,
  customerOutstanding,
  supplierOutstanding,
  validateInitialVehiclePayment,
  validateVehicleDeal,
} from "./vehicle-sales";

describe("vehicle deal calculations", () => {
  it("funds a customer discount from dealer commission", () => {
    const deal = computeVehicleDeal({
      listPrice: 10_000_000,
      supplierSettlementDue: 9_400_000,
      customerDiscount: 150_000,
    });
    expect(deal).toMatchObject({
      grossDealerCommission: 600_000,
      customerPrice: 9_850_000,
      netDealerCommission: 450_000,
    });
    expect(validateVehicleDeal(deal)).toBeNull();
  });

  it("requires admin override and a reason for a loss-making discount", () => {
    const deal = computeVehicleDeal({
      listPrice: 10_000,
      supplierSettlementDue: 9_500,
      customerDiscount: 700,
    });
    expect(validateVehicleDeal(deal)).toContain("Administrator");
    expect(validateVehicleDeal(deal, { allowLoss: true })).toContain("reason");
    expect(validateVehicleDeal(deal, { allowLoss: true, lossOverrideReason: "Approved clearance" })).toBeNull();
  });
});

describe("vehicle payment rules", () => {
  it("requires cash sales to be paid in full", () => {
    expect(validateInitialVehiclePayment({ saleType: "CASH", customerPrice: 100, downPayment: 90 })).toContain("full");
  });

  it("requires external finance to cover the balance", () => {
    expect(validateInitialVehiclePayment({
      saleType: "EXTERNAL_FINANCE",
      customerPrice: 100,
      downPayment: 20,
      financeApprovedAmount: 70,
    })).toContain("does not cover");
    expect(customerOutstanding({ saleType: "EXTERNAL_FINANCE", customerPrice: 100, customerCollected: 20 })).toBe(0);
  });

  it("calculates independent customer and supplier balances", () => {
    expect(customerOutstanding({ saleType: "IN_HOUSE_CREDIT", customerPrice: 100, customerCollected: 25 })).toBe(75);
    expect(supplierOutstanding(80, 30)).toBe(50);
  });
});

describe("vehicle document workflow", () => {
  it("allows only the forward custody workflow", () => {
    expect(canTransitionVehicleDocuments("DOCUMENTS_RECEIVED", "SUBMITTED")).toBe(true);
    expect(canTransitionVehicleDocuments("REGISTERED", "HANDED_OVER")).toBe(true);
    expect(canTransitionVehicleDocuments("HANDED_OVER", "PROCESSING")).toBe(false);
  });
});
