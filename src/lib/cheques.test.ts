import { describe, expect, it } from "vitest";
import { chequeBalance, chequeStatus, validateChequePayment } from "./cheques";

describe("chequeBalance", () => {
  it("derives the decreasing balance from repayments", () => {
    expect(chequeBalance(100_000, [20_000, 12_500.25])).toBe(67_499.75);
  });

  it("never returns a negative display balance", () => {
    expect(chequeBalance(100, [120])).toBe(0);
  });
});

describe("chequeStatus", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  it("marks a fully repaid cheque settled regardless of date", () => {
    expect(chequeStatus(new Date("2026-07-01T00:00:00+05:30"), 0, now)).toBe("SETTLED");
  });
  it("distinguishes upcoming, due today, and overdue", () => {
    expect(chequeStatus(new Date("2026-07-16T00:00:00+05:30"), 1, now)).toBe("UPCOMING");
    expect(chequeStatus(new Date("2026-07-15T00:00:00+05:30"), 1, now)).toBe("DUE");
    expect(chequeStatus(new Date("2026-07-14T00:00:00+05:30"), 1, now)).toBe("OVERDUE");
  });
  it("changes day at Colombo midnight, not UTC midnight", () => {
    const due = new Date("2026-07-16T00:00:00+05:30");
    expect(chequeStatus(due, 1, new Date("2026-07-15T18:29:59Z"))).toBe("UPCOMING");
    expect(chequeStatus(due, 1, new Date("2026-07-15T18:30:00Z"))).toBe("DUE");
  });
});

describe("validateChequePayment", () => {
  it("rejects invalid and excessive payments", () => {
    expect(validateChequePayment(0, 100)).toMatch(/valid/i);
    expect(validateChequePayment(100.01, 100)).toMatch(/exceed/i);
    expect(validateChequePayment(100, 100)).toBeNull();
  });
});
