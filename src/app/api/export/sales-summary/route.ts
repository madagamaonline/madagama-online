import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";
import { toNum, round2 } from "@/lib/utils";
import { businessStartOfDay, businessStartOfMonth, businessMonthKey, businessDayKey, addDays } from "@/lib/dates";

export const dynamic = "force-dynamic";
const MS_PER_DAY = 86_400_000;

// Combined daily sales for the standard report. Category detail is available
// only from the admin tax ledger and its separately authorized export.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.role === "SALESPERSON") return new Response("Forbidden", { status: 403 });

  const now = new Date();
  const nowKey = businessMonthKey(now);
  const raw = new URL(req.url).searchParams.get("month") ?? "";
  const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= nowKey ? raw : nowKey;
  const monthStart = businessStartOfMonth(new Date(`${key}-15T00:00:00Z`));
  const monthEnd = businessStartOfMonth(addDays(monthStart, 45));
  const rowsEnd = monthEnd > now ? addDays(businessStartOfDay(now), 1) : monthEnd;
  const [invoices, returns] = await Promise.all([
    prisma.invoice.findMany({ where: { createdAt: { gte: monthStart, lt: monthEnd }, voidedAt: null }, select: { createdAt: true, grandTotal: true } }),
    prisma.salesReturn.findMany({ where: { date: { gte: monthStart, lt: monthEnd }, OR: [{ invoiceId: null }, { invoice: { voidedAt: null } }] }, select: { date: true, totalRefund: true } }),
  ]);
  const days = new Map<string, { count: number; gross: number; refunds: number }>();
  for (const invoice of invoices) {
    const key = businessDayKey(invoice.createdAt);
    const row = days.get(key) ?? { count: 0, gross: 0, refunds: 0 };
    row.count += 1;
    row.gross += toNum(invoice.grandTotal);
    days.set(key, row);
  }
  for (const item of returns) {
    const key = businessDayKey(item.date);
    const row = days.get(key) ?? { count: 0, gross: 0, refunds: 0 };
    row.refunds += toNum(item.totalRefund);
    days.set(key, row);
  }
  const numDays = Math.max(0, Math.round((rowsEnd.getTime() - monthStart.getTime()) / MS_PER_DAY));
  const rows = Array.from({ length: numDays }, (_, i) => {
    const key = businessDayKey(addDays(monthStart, i));
    const day = days.get(key) ?? { count: 0, gross: 0, refunds: 0 };
    return [key, day.count, round2(day.gross), round2(day.refunds), round2(day.gross - day.refunds)];
  });
  const gross = rows.reduce((sum, row) => sum + Number(row[2]), 0);
  const refunds = rows.reduce((sum, row) => sum + Number(row[3]), 0);
  rows.push(["TOTAL", invoices.length, round2(gross), round2(refunds), round2(gross - refunds)]);
  return csvResponse(toCsv(["Date", "Invoices", "Gross sales", "Refunds", "Net sales"], rows), `sales-summary-${key}.csv`);
}
