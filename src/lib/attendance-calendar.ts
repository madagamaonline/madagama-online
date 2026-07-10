export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validate a calendar date without involving the server or browser timezone. */
export function isValidDateKey(value: string | undefined): value is string {
  const match = value?.match(DATE_KEY);
  if (!value || !match || Number(match[1]) < 1000) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** UTC boundaries for the month containing a validated YYYY-MM-DD key. */
export function monthBounds(dateKey: string): { start: Date; end: Date } {
  const [year, month] = dateKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

/** Move a date by whole calendar months, clamping to the destination month. */
export function shiftDateKeyMonth(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clamped = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
  return clamped.toISOString().slice(0, 10);
}

/** The month dates plus leading/trailing blanks needed for complete weeks. */
export function calendarMonthCells(dateKey: string): Array<string | null> {
  const { start, end } = monthBounds(dateKey);
  const leading = start.getUTCDay();
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const used = leading + days;
  const trailing = (7 - (used % 7)) % 7;

  return [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(index + 1);
      return date.toISOString().slice(0, 10);
    }),
    ...Array<null>(trailing).fill(null),
  ];
}

export function monthTitle(dateKey: string): string {
  return new Date(`${dateKey.slice(0, 7)}-01T12:00:00.000Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
