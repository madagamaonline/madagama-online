import {
  businessStartOfDay,
  businessStartOfMonth,
  businessDayKey,
  businessMonthKey,
  addDays,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { computePayroll } from "@/lib/payroll";
import { nonTaxableEnabled, invoiceTaxableWhere, productTaxableWhere } from "@/lib/tax-mode";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SalesChart } from "@/components/sales-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, toNum, round2 } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const now = new Date();
  const monthStart = businessStartOfMonth(now);
  const monthStr = businessMonthKey(now);
  const start30 = addDays(businessStartOfDay(now), -29);

  // Last 12 business-months (keys + labels), oldest first.
  const [curY, curM] = monthStr.split("-").map(Number); // curM is 1-12
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
  const start12mo = businessStartOfMonth(new Date(`${monthSeq[0].key}-01T12:00:00Z`));

  // Non-taxable kill-switch — when off, every figure is taxable-only (cached read,
  // no extra round-trip).
  const ntEnabled = await nonTaxableEnabled();
  const taxF = invoiceTaxableWhere(ntEnabled);
  const prodF = productTaxableWhere(ntEnabled);

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
  ] = await Promise.all([
    prisma.invoice.findMany({ where: { createdAt: { gte: start12mo }, ...taxF }, select: { createdAt: true, grandTotal: true } }),
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { createdAt: { gte: monthStart }, ...taxF } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { createdAt: { gte: monthStart }, ...taxF } },
      select: { qty: true, lineTotal: true, nameSnapshot: true, costSnapshot: true, product: { select: { costPrice: true } } },
    }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: monthStart } } }),
    computePayroll(monthStr),
    prisma.invoice.groupBy({
      by: ["taxCategory"],
      _sum: { grandTotal: true },
      where: { createdAt: { gte: monthStart }, ...taxF },
    }),
    prisma.invoice.groupBy({
      by: ["createdByUserId"],
      _sum: { grandTotal: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart }, ...taxF },
    }),
    prisma.invoice.groupBy({
      by: ["soldByEmployeeId"],
      _sum: { grandTotal: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart }, ...taxF },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.employee.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { active: true, ...prodF },
      select: { id: true, code: true, name: true, quantityInStock: true, costPrice: true, reorderLevel: true },
    }),
    prisma.purchase.aggregate({ _sum: { total: true }, where: { date: { gte: monthStart } } }),
    prisma.supplierReturn.aggregate({ _sum: { totalValue: true }, where: { date: { gte: monthStart } } }),
    prisma.salesReturn.aggregate({ _sum: { totalRefund: true }, where: { date: { gte: monthStart } } }),
    prisma.salesReturnItem.findMany({
      where: { return: { date: { gte: monthStart } } },
      select: { qty: true, costSnapshot: true, product: { select: { costPrice: true } } },
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

  // Purchasing (this month): stock bought, value returned to suppliers, and net.
  const purchasesMonth = toNum(purchaseAgg._sum.total ?? 0);
  const supplierReturnsMonth = toNum(supplierReturnAgg._sum.totalValue ?? 0);
  const netPurchases = round2(purchasesMonth - supplierReturnsMonth);

  // Stock valuation (at cost) + low-stock list.
  const stockValue = round2(stockProducts.reduce((s, p) => s + p.quantityInStock * toNum(p.costPrice), 0));
  const lowStock = stockProducts
    .filter((p) => p.reorderLevel > 0 && p.quantityInStock <= p.reorderLevel)
    .sort((a, b) => a.quantityInStock - b.quantityInStock);

  const taxableSales = toNum(categoryAgg.find((c) => c.taxCategory === "TAXABLE")?._sum.grandTotal ?? 0);
  const nonTaxableSales = toNum(categoryAgg.find((c) => c.taxCategory === "NON_TAXABLE")?._sum.grandTotal ?? 0);

  // Daily (last 30 business-days)
  const dailyMap = new Map<string, number>();
  for (const inv of trendInvoices) {
    if (inv.createdAt >= start30) {
      const k = businessDayKey(inv.createdAt);
      dailyMap.set(k, (dailyMap.get(k) ?? 0) + toNum(inv.grandTotal));
    }
  }
  const dailyData = Array.from({ length: 30 }, (_, i) => {
    const key = businessDayKey(addDays(start30, i));
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

  // Profit (this month, approximate)
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
  const payroll = round2(payrollLines.reduce((s, l) => s + l.netPay, 0));
  const grossProfit = round2(revenue - refunds - (cogs - returnedCogs));
  const netProfit = round2(grossProfit - expenses - payroll);

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
    <div>
      <PageHeader
        title="Reports"
        subtitle={`Sales trends & profit — ${now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Colombo" })}`}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Revenue (month)" value={formatLKR(revenue)} tone="green" />
        <StatCard label="Less: customer refunds" value={formatLKR(refunds)} tone={refunds > 0 ? "red" : "default"} />
        <StatCard label="Cost of goods (net of returns)" value={formatLKR(round2(cogs - returnedCogs))} tone="amber" />
        <StatCard label="Gross profit" value={formatLKR(grossProfit)} tone="blue" />
        <StatCard label="Expenses" value={formatLKR(expenses)} tone="amber" />
        <StatCard label="Payroll" value={formatLKR(payroll)} tone="amber" />
        <StatCard label="Net profit (approx.)" value={formatLKR(netProfit)} tone={netProfit >= 0 ? "green" : "red"} />
      </div>

      <div className={`mb-4 grid grid-cols-1 gap-4 ${ntEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {ntEnabled ? (
          <>
            <StatCard label="Taxable sales (month)" value={formatLKR(taxableSales)} tone="blue" />
            <StatCard label="Non-taxable sales (month)" value={formatLKR(nonTaxableSales)} tone="default" />
          </>
        ) : (
          <StatCard label="Sales (month)" value={formatLKR(taxableSales)} tone="blue" />
        )}
        <StatCard label="Stock value (at cost)" value={formatLKR(stockValue)} tone="amber" />
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Sales (last 30 days)</CardTitle>
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
        Net profit is approximate: revenue − customer refunds − cost of goods (captured at the time of sale, credited back for restocked returns at current cost) − expenses − payroll for the month. Credit-sale interest income is not included.
      </p>
    </div>
  );
}
