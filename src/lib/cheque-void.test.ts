import { describe, expect, it } from "vitest";
import { chequeVoidEligibilityError, purchaseStatusFor, reversalAmount, voidChequeSchema } from "./cheque-void";
import { chequeState, isLiveCheque, isVoidState } from "./cheques";

describe("chequeVoidEligibilityError", () => {
  const ok = { alreadyVoided: false, cleared: false, hasReplacement: false };

  it("allows a live, unpresented cheque to be stopped", () => {
    expect(chequeVoidEligibilityError(ok)).toBeNull();
  });

  it("refuses to stop a cheque the bank already honoured", () => {
    expect(chequeVoidEligibilityError({ ...ok, cleared: true })).toMatch(/already cleared/i);
  });

  it("refuses to void twice", () => {
    expect(chequeVoidEligibilityError({ ...ok, alreadyVoided: true })).toMatch(/already been stopped/i);
  });

  it("refuses to void a cheque that already has a replacement", () => {
    expect(chequeVoidEligibilityError({ ...ok, hasReplacement: true })).toMatch(/already been replaced/i);
  });
});

describe("reversalAmount", () => {
  it("hands back the whole cheque when nothing had cleared", () => {
    expect(reversalAmount(50_000, 50_000)).toBe(50_000);
  });

  it("hands back only the part the supplier never received", () => {
    // Legacy part-cleared cheque: 20,000 really left the bank, 30,000 did not.
    expect(reversalAmount(30_000, 50_000)).toBe(30_000);
  });

  it("never pushes a purchase below zero paid", () => {
    // A supplier return already credited most of the balance.
    expect(reversalAmount(50_000, 12_500)).toBe(12_500);
    expect(reversalAmount(50_000, 0)).toBe(0);
  });
});

describe("purchaseStatusFor", () => {
  it("puts a fully reversed purchase back on credit", () => {
    expect(purchaseStatusFor(80_000, 0)).toBe("CREDIT");
  });

  it("marks a partly reversed purchase partial", () => {
    expect(purchaseStatusFor(80_000, 30_000)).toBe("PARTIAL");
  });

  it("keeps a settled purchase paid", () => {
    expect(purchaseStatusFor(80_000, 80_000)).toBe("PAID");
  });
});

describe("chequeState", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  const dueDate = new Date("2026-07-01T00:00:00+05:30");

  it("freezes a voided cheque instead of calling it overdue", () => {
    expect(chequeState({ dueDate, voidKind: "STOPPED" }, 50_000, now)).toBe("STOPPED");
    expect(chequeState({ dueDate, voidKind: "BOUNCED" }, 50_000, now)).toBe("BOUNCED");
  });

  it("falls back to the date-based status when the cheque is alive", () => {
    expect(chequeState({ dueDate, voidKind: null }, 50_000, now)).toBe("OVERDUE");
    expect(chequeState({ dueDate, voidKind: null }, 0, now)).toBe("SETTLED");
  });
});

describe("isLiveCheque", () => {
  it("drops a voided cheque out of bank exposure", () => {
    expect(isLiveCheque({ voidedAt: new Date() }, 50_000)).toBe(false);
    expect(isLiveCheque({ voidedAt: null }, 50_000)).toBe(true);
    expect(isLiveCheque({ voidedAt: null }, 0)).toBe(false);
  });
});

describe("isVoidState", () => {
  it("separates terminal void states from live ones", () => {
    expect(isVoidState("STOPPED")).toBe(true);
    expect(isVoidState("CANCELLED")).toBe(true);
    expect(isVoidState("OVERDUE")).toBe(false);
    expect(isVoidState("SETTLED")).toBe(false);
  });
});

describe("voidChequeSchema", () => {
  const base = { chequeId: "c1", kind: "STOPPED", voidedDate: "2026-08-12" };

  it("requires a real reason", () => {
    expect(voidChequeSchema.safeParse({ ...base, reason: "  " }).success).toBe(false);
    expect(voidChequeSchema.safeParse({ ...base, reason: "Goods never delivered" }).success).toBe(true);
  });

  it("rejects an unknown void kind", () => {
    expect(voidChequeSchema.safeParse({ ...base, kind: "LOST", reason: "misplaced" }).success).toBe(false);
  });
});
