import { describe, expect, it } from "vitest";
import {
  calendarMonthCells,
  isValidDateKey,
  monthBounds,
  monthTitle,
  shiftDateKeyMonth,
} from "./attendance-calendar";

describe("attendance calendar date helpers", () => {
  it("validates real calendar dates", () => {
    expect(isValidDateKey("2026-07-10")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("0099-01-01")).toBe(false);
    expect(isValidDateKey("not-a-date")).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
  });

  it("returns UTC-safe month boundaries", () => {
    const { start, end } = monthBounds("2026-12-15");
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("moves across years and clamps the selected day", () => {
    expect(shiftDateKeyMonth("2026-01-31", -1)).toBe("2025-12-31");
    expect(shiftDateKeyMonth("2024-01-31", 1)).toBe("2024-02-29");
    expect(shiftDateKeyMonth("2025-01-31", 1)).toBe("2025-02-28");
  });

  it("builds complete Sunday-to-Saturday weeks", () => {
    const cells = calendarMonthCells("2026-07-10");
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]).toBe("2026-07-01");
    expect(cells.filter(Boolean)).toHaveLength(31);
  });

  it("formats a stable UTC month title", () => {
    expect(monthTitle("2026-07-10")).toBe("July 2026");
  });
});
