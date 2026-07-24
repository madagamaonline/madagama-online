import { describe, expect, it } from "vitest";
import { monthGrid, parseMonthKey, shiftMonth } from "@/lib/cheque-calendar";

describe("cheque calendar", () => {
  it("builds a stable six-week month grid", () => {
    const grid = monthGrid("2026-07", new Date("2026-07-24T02:00:00Z"));
    expect(grid).toHaveLength(35);
    expect(grid.filter((day) => day.inMonth)).toHaveLength(31);
    expect(grid.find((day) => day.key === "2026-07-24")?.isToday).toBe(true);
  });
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("rejects malformed month keys", () => {
    expect(parseMonthKey("2026-13", new Date("2026-07-01T00:00:00Z"))).toBe("2026-07");
  });
});
