import { describe, it, expect } from "vitest";
import { normalizeLkPhone, toTextLkPhone, validateLkPhone } from "./phone";

describe("normalizeLkPhone", () => {
  it("normalises common Sri Lankan formats to 0XXXXXXXXX", () => {
    expect(normalizeLkPhone("0771234567")).toBe("0771234567");
    expect(normalizeLkPhone("771234567")).toBe("0771234567");
    expect(normalizeLkPhone("94771234567")).toBe("0771234567");
    expect(normalizeLkPhone("+94 77 123 4567")).toBe("0771234567");
    expect(normalizeLkPhone("077-123 4567")).toBe("0771234567");
  });

  it("returns null for empty input", () => {
    expect(normalizeLkPhone("")).toBeNull();
    expect(normalizeLkPhone("   ")).toBeNull();
  });
});

describe("validateLkPhone", () => {
  it("accepts 9-digit, 10-digit and international forms", () => {
    expect(validateLkPhone("0771234567")).toEqual({ ok: true, normalized: "0771234567" });
    expect(validateLkPhone("771234567")).toEqual({ ok: true, normalized: "0771234567" });
    expect(validateLkPhone("94771234567")).toEqual({ ok: true, normalized: "0771234567" });
    expect(validateLkPhone("0721234567")).toEqual({ ok: true, normalized: "0721234567" });
  });

  it("rejects malformed numbers", () => {
    expect(validateLkPhone("123").ok).toBe(false);
    expect(validateLkPhone("").ok).toBe(false);
    expect(validateLkPhone("07712345678").ok).toBe(false); // too long
    expect(validateLkPhone("077123456").ok).toBe(false); // too short
  });

  it("treats different inputs for the same number as equal", () => {
    const a = validateLkPhone("0771234567");
    const b = validateLkPhone("94771234567");
    expect(a.ok && b.ok && a.normalized === b.normalized).toBe(true);
  });
});

describe("toTextLkPhone", () => {
  it("produces the 94XXXXXXXXX form text.lk expects", () => {
    expect(toTextLkPhone("0771234567")).toBe("94771234567");
    expect(toTextLkPhone("771234567")).toBe("94771234567");
    expect(toTextLkPhone("94771234567")).toBe("94771234567");
  });
});
