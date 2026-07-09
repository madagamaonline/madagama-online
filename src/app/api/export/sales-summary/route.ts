import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";
import { toNum, round2 } from "@/lib/utils";
import { nonTaxableEnabled, invoiceTaxableWhere } from "@/lib/tax-mode";
import { businessStartOfDay, businessStartOfMonth, businessMonthKey, businessDayKey, addDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

// Per-day sales summary for one business month (?month=YYYY-MM, defaults to the
// current month) — one row per day with invoice count, sales, refunds and net,
// plus a TOTAL row. Meant for owners doing their bookkeeping in Excel.
export async function GET(req: Request) {
  // Daily takings — re-check auth here, not just in the proxy.
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const nowKey = businessMonthKey(now);
  const raw = new URL(req.url).searchParams.get("month") ?? "";
  const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= nowKey ? raw : nowKey;
  const monthStart = businessStartOfMonth(new Date(`${key}-15T00:00:00Z`));
  const monthEnd = businessStartOfMonth(addDays(monthStart, 45)); // first instant of the following month
  // For the current month, stop at today instead of listing empty future days.
  const rowsEnd = monthEnd > now ? addDays(businessStartOfDay(now), 1) : monthEnd;

  const ntEnabled = await nonTaxableEnabled();
  const taxF = invoiceTaxableWhere(ntEnabled);

  const [invoices, returns] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: monthStart, lt: monthEnd }, ...taxF },
      select: { createdAt: true, grandTotal: true },
    }),
    prisma.salesReturn.findMany({
      where: { date: { gte: monthStart, lt: monthEnd }, ...(ntEnabled ? {} : { invoice: taxF }) },
      select: { date: true, totalRefund: true },
    }),
  ]);

  const salesByDay = new Map<string, number>();
  const countByDay = new Map<string, number>();
  for (const inv of invoices) {
    const k = businessDayKey(inv.createdAt);
    salesByDay.set(k, (salesByDay.get(k) ?? 0) + toNum(inv.grandTotal));
    countByDay.set(k, (countByDay.get(k) ?? 0) + 1);
  }
  const refundsByDay = new Map<string, number>();
  for (const r of returns) {
    const k = businessDayKey(r.date);
    refundsByDay.set(k, (refundsByDay.get(k) ?? 0) + toNum(r.totalRefund));
  }

  const numDays = Math.max(0, Math.round((rowsEnd.getTime() - monthStart.getTime()) / MS_PER_DAY));
  const rows = Array.from({ length: numDays }, (_, i) => {
    const k = businessDayKey(addDays(monthStart, i));
    const sales = round2(salesByDay.get(k) ?? 0);
    const refunds = round2(refundsByDay.get(k) ?? 0);
    return [k, countByDay.get(k) ?? 0, sales, refunds, round2(sales - refunds)];
  });
  const totalSales = round2(rows.reduce((s, r) => s + Number(r[2]), 0));
  const totalRefunds = round2(rows.reduce((s, r) => s + Number(r[3]), 0));
  rows.push(["TOTAL", invoices.length, totalSales, totalRefunds, round2(totalSales - totalRefunds)]);

  const csv = toCsv(["Date", "Invoices", "Sales", "Refunds", "Net sales"], rows);
  return csvResponse(csv, `sales-summary-${key}.csv`);
}
