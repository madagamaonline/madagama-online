import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";
import { toNum, round2 } from "@/lib/utils";
import { businessStartOfDay, businessStartOfMonth, businessMonthKey, businessDayKey, addDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

// Per-day sales summary for one business month (?month=YYYY-MM, defaults to the
// current month) — one row per day with invoice count, sales, refunds and net,
// plus a TOTAL row. Meant for owners doing their bookkeeping in Excel.
export async function GET(req: Request) {
  // Daily takings — re-check auth here, not just in the proxy.
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (session.role === "SALESPERSON") {
    return new Response("Forbidden", { status: 403 });
  }

  const now = new Date();
  const nowKey = businessMonthKey(now);
  const raw = new URL(req.url).searchParams.get("month") ?? "";
  const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= nowKey ? raw : nowKey;
  const monthStart = businessStartOfMonth(new Date(`${key}-15T00:00:00Z`));
  const monthEnd = businessStartOfMonth(addDays(monthStart, 45)); // first instant of the following month
  // For the current month, stop at today instead of listing empty future days.
  const rowsEnd = monthEnd > now ? addDays(businessStartOfDay(now), 1) : monthEnd;

  const [invoices, returns] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: monthStart, lt: monthEnd }, voidedAt: null },
      select: { createdAt: true, grandTotal: true, taxCategory: true },
    }),
    prisma.salesReturn.findMany({
      where: {
        date: { gte: monthStart, lt: monthEnd },
        OR: [{ invoiceId: null }, { invoice: { voidedAt: null } }],
      },
      select: { date: true, totalRefund: true, invoice: { select: { taxCategory: true } } },
    }),
  ]);

  type DayTotals = {
    taxableCount: number;
    nonTaxableCount: number;
    taxableSales: number;
    nonTaxableSales: number;
    taxableRefunds: number;
    nonTaxableRefunds: number;
    unclassifiedRefunds: number;
  };
  const emptyDay = (): DayTotals => ({
    taxableCount: 0,
    nonTaxableCount: 0,
    taxableSales: 0,
    nonTaxableSales: 0,
    taxableRefunds: 0,
    nonTaxableRefunds: 0,
    unclassifiedRefunds: 0,
  });
  const totalsByDay = new Map<string, DayTotals>();
  for (const inv of invoices) {
    const k = businessDayKey(inv.createdAt);
    const day = totalsByDay.get(k) ?? emptyDay();
    if (inv.taxCategory === "TAXABLE") {
      day.taxableCount += 1;
      day.taxableSales += toNum(inv.grandTotal);
    } else {
      day.nonTaxableCount += 1;
      day.nonTaxableSales += toNum(inv.grandTotal);
    }
    totalsByDay.set(k, day);
  }
  for (const r of returns) {
    const k = businessDayKey(r.date);
    const day = totalsByDay.get(k) ?? emptyDay();
    if (r.invoice?.taxCategory === "TAXABLE") day.taxableRefunds += toNum(r.totalRefund);
    else if (r.invoice?.taxCategory === "NON_TAXABLE") day.nonTaxableRefunds += toNum(r.totalRefund);
    else day.unclassifiedRefunds += toNum(r.totalRefund);
    totalsByDay.set(k, day);
  }

  const numDays = Math.max(0, Math.round((rowsEnd.getTime() - monthStart.getTime()) / MS_PER_DAY));
  const rows = Array.from({ length: numDays }, (_, i) => {
    const k = businessDayKey(addDays(monthStart, i));
    const day = totalsByDay.get(k) ?? emptyDay();
    const taxableSales = round2(day.taxableSales);
    const nonTaxableSales = round2(day.nonTaxableSales);
    const taxableRefunds = round2(day.taxableRefunds);
    const nonTaxableRefunds = round2(day.nonTaxableRefunds);
    const unclassifiedRefunds = round2(day.unclassifiedRefunds);
    const taxableNet = round2(taxableSales - taxableRefunds);
    const nonTaxableNet = round2(nonTaxableSales - nonTaxableRefunds);
    return [
      k,
      day.taxableCount,
      taxableSales,
      taxableRefunds,
      taxableNet,
      day.nonTaxableCount,
      nonTaxableSales,
      nonTaxableRefunds,
      nonTaxableNet,
      unclassifiedRefunds,
      day.taxableCount + day.nonTaxableCount,
      round2(taxableSales + nonTaxableSales),
      round2(taxableNet + nonTaxableNet - unclassifiedRefunds),
    ];
  });
  rows.push([
    "TOTAL",
    rows.reduce((sum, row) => sum + Number(row[1]), 0),
    round2(rows.reduce((sum, row) => sum + Number(row[2]), 0)),
    round2(rows.reduce((sum, row) => sum + Number(row[3]), 0)),
    round2(rows.reduce((sum, row) => sum + Number(row[4]), 0)),
    rows.reduce((sum, row) => sum + Number(row[5]), 0),
    round2(rows.reduce((sum, row) => sum + Number(row[6]), 0)),
    round2(rows.reduce((sum, row) => sum + Number(row[7]), 0)),
    round2(rows.reduce((sum, row) => sum + Number(row[8]), 0)),
    round2(rows.reduce((sum, row) => sum + Number(row[9]), 0)),
    invoices.length,
    round2(rows.reduce((sum, row) => sum + Number(row[11]), 0)),
    round2(rows.reduce((sum, row) => sum + Number(row[12]), 0)),
  ]);

  const csv = toCsv([
    "Date",
    "Taxable invoices",
    "Taxable gross sales",
    "Taxable refunds",
    "Taxable net sales",
    "Non-taxable invoices",
    "Non-taxable gross sales",
    "Non-taxable refunds",
    "Non-taxable net sales",
    "Unclassified legacy refunds",
    "All invoices",
    "All gross sales",
    "All net sales",
  ], rows);
  return csvResponse(csv, `sales-summary-${key}.csv`);
}
