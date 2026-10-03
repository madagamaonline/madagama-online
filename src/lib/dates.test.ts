import { describe, expect, it } from "vitest";
import { businessToday, parsePaymentDateInput } from "./dates";
import { csvDate } from "./csv";
import { formatDate } from "./utils";

// 02:00 on 3 Oct in Sri Lanka is still 2 Oct in UTC.
const earlyMorning = new Date("2026-10-02T20:30:00Z");

describe("business-timezone dates", () => {
  it("uses the Sri Lanka calendar day for today", () => {
    expect(businessToday(earlyMorning)).toBe("2026-10-03");
    expect(csvDate(earlyMorning)).toBe("2026-10-03");
    expect(formatDate(earlyMorning)).toBe("03 Oct 2026");
  });

  it("maps today's payment date to now so it is never in the future", () => {
    expect(parsePaymentDateInput("2026-10-03", earlyMorning)).toBe(earlyMorning);
    expect(parsePaymentDateInput("2026-10-01", earlyMorning).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
