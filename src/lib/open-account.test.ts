import { describe, expect, it } from "vitest";
import { computeOpenAccountState, invoiceTypeLabel, openAccountInvoiceStatus, openAccountStatusLabel } from "./open-account";

describe("open account state", () => {
  it("handles unpaid, partial and exact settlement", () => {
    expect(computeOpenAccountState(1000, []).outstanding).toBe(1000);
    expect(computeOpenAccountState(1000, [{ amount: 250, method: "CASH" }]).outstanding).toBe(750);
    expect(computeOpenAccountState(1000, [{ amount: 1000, method: "BANK" }]).isSettled).toBe(true);
  });
  it("counts return credits toward balance but not cash", () => {
    const state = computeOpenAccountState(1000, [{ amount: 400, method: "RETURN" }, { amount: 100, method: "CASH" }]);
    expect(state).toMatchObject({ credited: 500, cashCollected: 100, returnCredits: 400, outstanding: 500 });
  });
  it("uses Colombo business dates for overdue state", () => {
    expect(computeOpenAccountState(1, [], new Date("2026-07-21T18:30:00Z"), new Date("2026-07-22T12:00:00Z")).isOverdue).toBe(false);
    expect(computeOpenAccountState(1, [], new Date("2026-07-21T00:00:00Z"), new Date("2026-07-22T12:00:00Z")).isOverdue).toBe(true);
  });
  it("provides friendly invoice labels", () => {
    expect(invoiceTypeLabel("OPEN_ACCOUNT")).toBe("PAY LATER");
    expect(openAccountStatusLabel("CREDIT")).toBe("UNPAID");
    expect(openAccountInvoiceStatus(100, 0)).toBe("CREDIT");
    expect(openAccountInvoiceStatus(100, 50)).toBe("PARTIAL");
    expect(openAccountInvoiceStatus(100, 100)).toBe("PAID");
  });
});
