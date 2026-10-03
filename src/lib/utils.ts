import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round to 2 decimal places (money-safe enough for this scale). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type Numeric = number | string | { toString(): string } | null | undefined;

export function toNum(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

export function formatLKR(value: Numeric): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNum(value));
}

export function formatNumber(value: Numeric): string {
  return new Intl.NumberFormat("en-LK").format(toNum(value));
}

/**
 * Human label for a signed day count where negative = overdue:
 * "Overdue 3d" / "Due today" / "Due tomorrow" / "Due in 5d".
 */
export function dueLabel(days: number): string {
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

// Always render in the business timezone. Without this, the server (UTC) shows
// a Sri Lanka midnight such as 2026-10-03T00:00+05:30 as the previous day.
const BUSINESS_TIME_ZONE = "Asia/Colombo";

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
