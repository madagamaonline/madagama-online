import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  businessStartOfDay,
  businessStartOfMonth,
  businessDayKey,
  businessMonthKey,
  addDays,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { computePayroll } from "@/lib/payroll";
import { computeCreditState } from "@/lib/credit";
import { getSettings } from "@/lib/settings";
import { nonTaxableEnabled, activeInvoiceWhere, productTaxableWhere } from "@/lib/tax-mode";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { StatCard } from "@/components/stat-card";
import { SalesChart } from "@/components/sales-chart";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, toNum, round2 } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

/** First instant of the business month named by a `YYYY-MM` key. */
function monthStartFromKey(key: string): Date {
  return businessStartOfMonth(new Date(`${key}-15T00:00:00Z`));
}

/** Shift a `YYYY-MM` key by whole months. */
function shiftMonthKey(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const abs = y * 12 + (m - 1) + by;
  return `${Math.floor(abs / 12)}-${String((abs % 12) + 1).padStart(2, "0")}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const now = new Date();
  const nowKey = businessMonthKey(now);

  // Selected business month (?month=YYYY-MM). Invalid or future values fall
  // back to the current month, so old bookmarks can't show an empty page.
  const selKey =
    monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) && monthParam < nowKey
      ? monthParam
      : nowKey;
  const isCurrent = selKey === nowKey;
  const monthStart = monthStartFromKey(selKey);
  const monthEnd = businessStartOfMonth(addDays(monthStart, 45)); // first instant of the following month
  const monthLabel = new Date(`${selKey}-01T12:00:00Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const prevKey = shiftMonthKey(selKey, -1);
  const nextKey = shiftMonthKey(selKey, 1);
  const start30 = addDays(businessStartOfDay(now), -29);

  // Last 12 business-months (keys + labels), oldest first — always anchored to
  // today, regardless of which month is selected.
  const [curY, curM] = nowKey.split("-").map(Number); // curM is 1-12
  const monthSeq = Array.from({ length: 12 }, (_, i) => {
    let m = curM - 1 - (11 - i); // 0-based month index
    let y = curY;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    return { key, label };
  });
  const start12mo = monthStartFromKey(monthSeq[0].key);
  // Trend invoices must also cover the selected month when it's older than the
  // 12-month chart window.
  const trendStart = monthStart < start12mo ? monthStart : start12mo;

  // Non-taxable kill-switch — when off, every figure is taxable-only (cached read,
  // no extra round-trip).
  const ntEnabled = await nonTaxableEnabled();
  const taxF = activeInvoiceWhere(ntEnabled);
  const prodF = productTaxableWhere(ntEnabled);
  const settings = await getSettings(); // cached — for the print letterhead

  const [
    trendInvoices,
    monthRevenueAgg,
    monthItems,
    expenseAgg,
    payrollLines,
    categoryAgg,
    cashierAgg,
    salesAgg,
    users,
    employees,
    stockProducts,
    purchaseAgg,
    supplierReturnAgg,
    refundAgg,
    returnedItems,
    interestAgreements,
  ] = await Promise.all([
    prisma.invoice.findMany({ where: { createdAt: { gte: trendStart }, ...taxF }, select: { createdAt: true, grandTotal: true } }),
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { createdAt: { gte: monthStart, lt: monthEnd }, ...taxF } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { createdAt: { gte: monthStart, lt: monthEnd }, ...taxF } },
      select: { qty: true, lineTotal: true, nameSnapshot: true, costSnapshot: true, product: { select: { costPrice: true } } },
    }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: monthStart, lt: monthEnd } } }),
    computePayroll(selKey),
    prisma.invoice.groupBy({
      by: ["taxCategory"],
      _sum: { grandTotal: true },
      where: { createdAt: { gte: monthStart, lt: monthEnd }, ...taxF },
    }),
    prisma.invoice.groupBy({
      by: ["createdByUserId"],
      _sum: { grandTotal: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart, lt: monthEnd }, ...taxF },
    }),
    prisma.invoice.groupBy({
      by: ["soldByEmployeeId"],
      _sum: { grandTotal: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart, lt: monthEnd }, ...taxF },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.employee.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { active: true, ...prodF },
      select: { id: true, code: true, name: true, quantityInStock: true, costPrice: true, reorderLevel: true },
    }),
    prisma.purchase.aggregate({ _sum: { total: true }, where: { date: { gte: monthStart, lt: monthEnd } } }),
    prisma.supplierReturn.aggregate({ _sum: { totalValue: true }, where: { date: { gte: monthStart, lt: monthEnd } } }),
    // Refunds and returned goods follow the same tax filter as revenue/COGS, so
    // gross profit stays consistent when the non-taxable switch is off. The
    // invoice relation is optional, so the filter is only added when narrowing.
    prisma.salesReturn.aggregate({
      _sum: { totalRefund: true },
      where: { date: { gte: monthStart, lt: monthEnd }, ...(ntEnabled ? {} : { invoice: taxF }) },
    }),
    prisma.salesReturnItem.findMany({
      where: { return: { date: { gte: monthStart, lt: monthEnd }, ...(ntEnabled ? {} : { invoice: taxF }) } },
      select: { qty: true, costSnapshot: true, product: { select: { costPrice: true } } },
    }),
    prisma.creditAgreement.findMany({
      where: {
        payments: { some: { paidDate: { gte: monthStart, lt: monthEnd } } },
        ...(ntEnabled ? {} : { invoice: taxF }),
      },
      select: {
        principal: true,
        startDate: true,
        interestRatePerMonth: true,
        interestFreeMonths: true,
        payments: { select: { amount: true, paidDate: true } },
      },
    }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const employeeMap = new Map(employees.map((e) => [e.id, e.name]));

  const cashierRows = cashierAgg
    .map((g) => ({
      name: g.createdByUserId ? (userMap.get(g.createdByUserId) ?? "Unknown") : "Not recorded",
      total: toNum(g._sum.grandTotal ?? 0),
      count: g._count._all,
    }))
    .sort((a, b) => b.total - a.total);

  const salesRows = salesAgg
    .map((g) => ({
      name: g.soldByEmployeeId ? (employeeMap.get(g.soldByEmployeeId) ?? "Unknown") : "Unassigned",
      total: toNum(g._sum.grandTotal ?? 0),
      count: g._count._all,
    }))
    .sort((a, b) => b.total - a.total);

  // Purchasing (selected month): stock bought, value returned to suppliers, and net.
  const purchasesMonth = toNum(purchaseAgg._sum.total ?? 0);
  const supplierReturnsMonth = toNum(supplierReturnAgg._sum.totalValue ?? 0);
  const netPurchases = round2(purchasesMonth - supplierReturnsMonth);

  // Stock valuation (at cost, as of today) + low-stock list.
  const stockValue = round2(stockProducts.reduce((s, p) => s + p.quantityInStock * toNum(p.costPrice), 0));
  const lowStock = stockProducts
    .filter((p) => p.reorderLevel > 0 && p.quantityInStock <= p.reorderLevel)
    .sort((a, b) => a.quantityInStock - b.quantityInStock);

  const taxableSales = toNum(categoryAgg.find((c) => c.taxCategory === "TAXABLE")?._sum.grandTotal ?? 0);
  const nonTaxableSales = toNum(categoryAgg.find((c) => c.taxCategory === "NON_TAXABLE")?._sum.grandTotal ?? 0);

  // Daily chart window: rolling last-30-days while viewing the current month,
  // the whole month when viewing a past one.
  const dayWindowStart = isCurrent ? start30 : monthStart;
  const dayWindowEnd = isCurrent ? addDays(businessStartOfDay(now), 1) : monthEnd;
  const numDays = Math.round((dayWindowEnd.getTime() - dayWindowStart.getTime()) / MS_PER_DAY);
  const dailyMap = new Map<string, number>();
  for (const inv of trendInvoices) {
    if (inv.createdAt >= dayWindowStart && inv.createdAt < dayWindowEnd) {
      const k = businessDayKey(inv.createdAt);
      dailyMap.set(k, (dailyMap.get(k) ?? 0) + toNum(inv.grandTotal));
    }
  }
  const dailyData = Array.from({ length: numDays }, (_, i) => {
    const key = businessDayKey(addDays(dayWindowStart, i));
    const dd = new Date(`${key}T00:00:00Z`);
    const label = `${String(dd.getUTCDate()).padStart(2, "0")} ${dd.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
    return { label, total: round2(dailyMap.get(key) ?? 0) };
  });

  // Monthly (last 12 business-months)
  const monthlyMap = new Map<string, number>();
  for (const inv of trendInvoices) {
    const k = businessMonthKey(inv.createdAt);
    monthlyMap.set(k, (monthlyMap.get(k) ?? 0) + toNum(inv.grandTotal));
  }
  const monthlyData = monthSeq.map(({ key, label }) => ({ label, total: round2(monthlyMap.get(key) ?? 0) }));

  // Profit (selected month, approximate)
  const revenue = toNum(monthRevenueAgg._sum.grandTotal ?? 0);
  // Prefer the cost captured at sale time; fall back to the product's current
  // cost for rows created before cost snapshots existed.
  const cogs = round2(
    monthItems.reduce(
      (s, it) => s + it.qty * toNum(it.costSnapshot ?? it.product?.costPrice ?? 0),
      0,
    ),
  );
  // Customer returns: refunds reduce revenue, and the restocked goods give
  // their cost back (they'll be counted again when re-sold), so both sides of
  // the gross-profit equation are corrected. Credit the cost captured at the
  // original sale (costSnapshot) so it matches how COGS above is valued; fall
  // back to current cost for returns created before snapshots existed.
  const refunds = toNum(refundAgg._sum.totalRefund ?? 0);
  const returnedCogs = round2(
    returnedItems.reduce((s, it) => s + it.qty * toNum(it.costSnapshot ?? it.product?.costPrice ?? 0), 0),
  );
  const expenses = toNum(expenseAgg._sum.amount ?? 0);
  // Payroll at true company cost: gross pay + employer EPF/ETF. Advance
  // recoveries are ignored — an advance is early payment of the same wage, not
  // a change in labor cost — and the employee's EPF share is still money the
  // business pays out, so net (take-home) pay would understate the cost.
  const payroll = round2(payrollLines.reduce((s, l) => s + l.employerCost, 0));
  const grossProfit = round2(revenue - refunds - (cogs - returnedCogs));
  const netProfit = round2(grossProfit - expenses - payroll);

  // Interest collected this month: payments clear outstanding interest before
  // principal (see computeCreditState), so the month's interest income is the
  // growth in interestPaid from just before the month started to its end,
  // summed over every agreement that received a payment this month.
  const asOfPrev = new Date(monthStart.getTime() - 1);
  const asOfEnd = new Date(monthEnd.getTime() - 1);
  const interestCollected = round2(
    interestAgreements.reduce((sum, a) => {
      const agreement = {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      };
      const pays = a.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate }));
      return (
        sum +
        computeCreditState(agreement, pays, asOfEnd).interestPaid -
        computeCreditState(agreement, pays, asOfPrev).interestPaid
      );
    }, 0),
  );

  // Top products this month
  const prodMap = new Map<string, { revenue: number; qty: number }>();
  for (const it of monthItems) {
    const cur = prodMap.get(it.nameSnapshot) ?? { revenue: 0, qty: 0 };
    cur.revenue += toNum(it.lineTotal);
    cur.qty += it.qty;
    prodMap.set(it.nameSnapshot, cur);
  }
  const topProducts = Array.from(prodMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return (
    <div className="print-area">
      {/* Print-only letterhead — the on-screen header and controls are hidden in print. */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold text-foreground">{settings?.businessName ?? "Madagama Pvt Ltd"}</h1>
        <p className="text-sm text-muted">
          Monthly report — {monthLabel} · Generated{" "}
          {now.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" })}
        </p>
      </div>

      <div className="no-print">
        <PageHeader
          title="Reports"
          subtitle={`Sales trends & profit — ${monthLabel}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/reports?month=${prevKey}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <form className="flex items-center gap-2">
                <Input key={selKey} type="month" name="month" defaultValue={selKey} max={nowKey} className="h-9 w-40" />
                <Button type="submit" variant="outline" size="sm">
                  View
                </Button>
              </form>
              {!isCurrent && (
                <Link
                  href={`/reports?month=${nextKey}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
              <a
                href={`/api/export/sales-summary?month=${selKey}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download className="h-4 w-4" /> Daily CSV
              </a>
              <PrintButton label="Print / Save PDF" />
            </div>
          }
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Revenue (month)" value={formatLKR(revenue)} tone="green" />
        <StatCard label="Less: customer refunds" value={formatLKR(refunds)} tone={refunds > 0 ? "red" : "default"} />
        <StatCard label="Cost of goods (net of returns)" value={formatLKR(round2(cogs - returnedCogs))} tone="amber" />
        <StatCard label="Gross profit" value={formatLKR(grossProfit)} tone="blue" />
        <StatCard label="Expenses" value={formatLKR(expenses)} tone="amber" />
        <StatCard label="Payroll (company cost)" value={formatLKR(payroll)} tone="amber" />
        <StatCard label="Net profit (approx.)" value={formatLKR(netProfit)} tone={netProfit >= 0 ? "green" : "red"} />
      </div>

      <div className={`mb-4 grid grid-cols-2 gap-4 ${ntEnabled ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {ntEnabled ? (
          <>
            <StatCard label="Taxable sales (month)" value={formatLKR(taxableSales)} tone="blue" />
            <StatCard label="Non-taxable sales (month)" value={formatLKR(nonTaxableSales)} tone="default" />
          </>
        ) : (
          <StatCard label="Sales (month)" value={formatLKR(taxableSales)} tone="blue" />
        )}
        <StatCard label="Interest collected (month)" value={formatLKR(interestCollected)} tone="green" />
        <StatCard label="Stock value (at cost, today)" value={formatLKR(stockValue)} tone="amber" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Purchases (month)" value={formatLKR(purchasesMonth)} tone="amber" />
        <StatCard label="Supplier returns (month)" value={formatLKR(supplierReturnsMonth)} tone="default" />
        <StatCard label="Net purchases (month)" value={formatLKR(netPurchases)} tone="blue" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales by cashier (month)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {cashierRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted">No sales this month yet.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Cashier</TH>
                    <TH className="text-right">Invoices</TH>
                    <TH className="text-right">Sales</TH>
                  </TR>
                </THead>
                <TBody>
                  {cashierRows.map((r) => (
                    <TR key={r.name}>
                      <TD className="font-medium">{r.name}</TD>
                      <TD className="text-right">{r.count}</TD>
                      <TD className="text-right font-medium">{formatLKR(r.total)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales by salesperson (month)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {salesRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted">No sales this month yet.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Salesperson</TH>
                    <TH className="text-right">Invoices</TH>
                    <TH className="text-right">Sales</TH>
                  </TR>
                </THead>
                <TBody>
                  {salesRows.map((r) => (
                    <TR key={r.name}>
                      <TD className="font-medium">{r.name}</TD>
                      <TD className="text-right">{r.count}</TD>
                      <TD className="text-right font-medium">{formatLKR(r.total)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts are on-screen only — the printed report keeps the tables. */}
      <div className="no-print grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{isCurrent ? "Daily Sales (last 30 days)" : `Daily Sales (${monthLabel})`}</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={dailyData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly Sales (last 12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={monthlyData} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Top Products This Month</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topProducts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">No sales this month yet.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">Qty Sold</TH>
                  <TH className="text-right">Revenue</TH>
                </TR>
              </THead>
              <TBody>
                {topProducts.map((p) => (
                  <TR key={p.name}>
                    <TD className="font-medium">{p.name}</TD>
                    <TD className="text-right">{p.qty}</TD>
                    <TD className="text-right font-medium">{formatLKR(p.revenue)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Low stock — reorder list</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lowStock.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">Everything is above its reorder level. 👍</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH className="text-right">In stock</TH>
                  <TH className="text-right">Reorder at</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs font-semibold">{p.code}</TD>
                    <TD className="font-medium">{p.name}</TD>
                    <TD className="text-right text-danger font-medium">{p.quantityInStock}</TD>
                    <TD className="text-right text-muted">{p.reorderLevel}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted">
        Net profit is approximate: revenue − customer refunds − cost of goods (captured at the time of sale, credited
        back for restocked returns) − expenses − payroll at company cost (gross pay + employer EPF/ETF; salary-advance
        recoveries don&apos;t change the cost) for the selected month. Interest collected on credit sales is shown
        separately and not included in net profit. Stock value and the low-stock list reflect today&apos;s stock, not
        the selected month.
      </p>
    </div>
  );
}
