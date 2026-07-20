import { describe, expect, it } from "vitest";
import { canAccessStaffFinance, defaultLandingPath, roleCanAccess } from "./authorization";

describe("server action role matrix", () => {
  it("allows staff to perform signed-in operational work", () => {
    expect(roleCanAccess("STAFF", "SIGNED_IN")).toBe(true);
  });

  it("blocks staff from admin-only financial and management work", () => {
    expect(roleCanAccess("STAFF", "ADMIN")).toBe(false);
    expect(roleCanAccess("ADMIN", "ADMIN")).toBe(true);
  });

  it("blocks salespeople from staff-and-finance areas only", () => {
    expect(roleCanAccess("SALESPERSON", "SIGNED_IN")).toBe(true);
    expect(roleCanAccess("SALESPERSON", "ADMIN")).toBe(false);
    expect(canAccessStaffFinance("SALESPERSON")).toBe(false);
    expect(canAccessStaffFinance("STAFF")).toBe(true);
    expect(canAccessStaffFinance("ADMIN")).toBe(true);
    expect(defaultLandingPath("SALESPERSON")).toBe("/invoices/new");
    expect(defaultLandingPath("STAFF")).toBe("/dashboard");
  });
});
