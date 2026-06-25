// Day/week/month boundaries for dashboards and reports, computed in the
// business timezone (Asia/Colombo, a fixed UTC+05:30 with no DST) rather than
// the server's process timezone. This matters in production: Vercel runs Node
// in UTC, so server-local date math would bucket late-evening Sri Lanka sales
// into the wrong day and shift the "today"/"this week" cutoffs by 5.5 hours.
//
// Sri Lanka has observed a constant +05:30 offset since 2006, so a fixed offset
// is correct and avoids a date-fns-tz dependency. If the business ever needs a
// configurable timezone, swap this constant for a Setting + date-fns-tz.
const BUSINESS_OFFSET_MIN = 5 * 60 + 30; // Asia/Colombo, UTC+05:30
const MS_PER_DAY = 86_400_000;

function toBusiness(d: Date): Date {
  return new Date(d.getTime() + BUSINESS_OFFSET_MIN * 60_000);
}
function fromBusiness(d: Date): Date {
  return new Date(d.getTime() - BUSINESS_OFFSET_MIN * 60_000);
}

/** UTC instant of the most recent business-midnight at or before `d`. */
export function businessStartOfDay(d: Date = new Date()): Date {
  const b = toBusiness(d);
  b.setUTCHours(0, 0, 0, 0);
  return fromBusiness(b);
}

/** UTC instant of business-midnight on Monday of `d`'s business week. */
export function businessStartOfWeek(d: Date = new Date()): Date {
  const b = toBusiness(d);
  b.setUTCHours(0, 0, 0, 0);
  const diff = (b.getUTCDay() + 6) % 7; // days since Monday (0=Sun..6=Sat)
  b.setUTCDate(b.getUTCDate() - diff);
  return fromBusiness(b);
}

/** UTC instant of business-midnight on the 1st of `d`'s business month. */
export function businessStartOfMonth(d: Date = new Date()): Date {
  const b = toBusiness(d);
  b.setUTCHours(0, 0, 0, 0);
  b.setUTCDate(1);
  return fromBusiness(b);
}

/** Add `n` whole days to a UTC instant (exact, since the business TZ has no DST). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** Stable business-day key (`YYYY-MM-DD`) for bucketing an instant by day. */
export function businessDayKey(d: Date): string {
  return toBusiness(d).toISOString().slice(0, 10);
}

/** Business-month key (`YYYY-MM`) for bucketing an instant by month. */
export function businessMonthKey(d: Date): string {
  return toBusiness(d).toISOString().slice(0, 7);
}

/** Weekday index (0=Sun..6=Sat) of an instant in the business timezone. */
export function businessWeekday(d: Date): number {
  return toBusiness(d).getUTCDay();
}
