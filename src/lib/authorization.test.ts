import { describe, expect, it } from "vitest";
import { roleCanAccess } from "./authorization";

describe("server action role matrix", () => {
  it("allows staff to perform signed-in operational work", () => {
    expect(roleCanAccess("STAFF", "SIGNED_IN")).toBe(true);
  });

  it("blocks staff from admin-only financial and management work", () => {
    expect(roleCanAccess("STAFF", "ADMIN")).toBe(false);
    expect(roleCanAccess("ADMIN", "ADMIN")).toBe(true);
  });
});
