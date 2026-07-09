import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import {
  businessStartOfDay,
  businessStartOfWeek,
  businessStartOfMonth,
  businessDayKey,
  businessWeekday,
  addDays,
} from "@/lib/dates";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  AlertTriangle,
  CreditCard,
  Package,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Coins,
  Trophy,
  Truck,
  CalendarClock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { computeCreditState } from "@/lib/credit";
import { Badge } from "@/components/ui/badge";
import { SalesChart } from "@/components/sales-chart";
import { formatLKR, formatDate, toNum, dueLabel } from "@/lib/utils";
import { nonTaxableEnabled, invoiceTaxableWhere, productTaxableWhere } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const startToday = businessStartOfDay(now);
  const startWeek = businessStartOfWeek(now);
  const startMonth = businessStartOfMonth(now);

  const startYesterday = addDays(startToday, -1);
  const startLastWeek = addDays(startWeek, -7);
  const startLastMonth = businessStartOfMonth(addDays(startMonth, -1));
  const start7 = addDays(startToday, -6);

  // Non-taxable kill-switch. Reads through the cached settings (already loaded by
  // the layout) so this awaits with no extra DB round-trip. When off, every sales
  // figure below is filtered to taxable-only.
  const ntEnabled = await nonTaxableEnabled();
  const taxF = invoiceTaxableWhere(ntEnabled); // {} or { taxCategory: "TAXABLE" }
  const prodF = productTaxableWhere(ntEnabled); // {} or { taxable: true }

  const [
    todaySales,
    yesterdaySales,
    weekSales,
    lastWeekSales,
    monthSales,
    lastMonthSales,
    agreements,
    recentInvoices,
    lowStockProductsRaw,
    dailyInvoicesRaw,
    todayByType,
    moneyInToday,
    todayItems,
    weekItems,
    weekByEmployee,
    employees,
    supplierCredits,
    todayRefundAgg,
    todayReturnedItems,
  ] = await Promise.all([
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, _count: true, where: { createdAt: { gte: startToday }, ...taxF } }),
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { createdAt: { gte: startYesterday, lt: startToday }, ...taxF } }),
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { createdAt: { gte: startWeek }, ...taxF } }),
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { createdAt: { gte: startLastWeek, lt: startWeek }, ...taxF } }),
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { createdAt: { gte: startMonth }, ...taxF } }),
    prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { createdAt: { gte: startLastMonth, lt: startMonth }, ...taxF } }),
    prisma.creditAgreement.findMany({
      where: { status: "ACTIVE", invoice: { ...taxF } },
      include: {
        customer: { select: { name: true } },
        invoice: { select: { invoiceNumber: true } },
        payments: { select: { amount: true, paidDate: true } },
      },
    }),
    prisma.invoice.findMany({
      take: 6,
      where: { ...taxF },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.product.findMany({
      where: { active: true, reorderLevel: { gt: 0 }, ...prodF },
      select: { id: true, code: true, name: true, quantityInStock: true, reorderLevel: true },
    }),
    prisma.invoice.findMany({ where: { createdAt: { gte: start7 }, ...taxF }, select: { grandTotal: true, createdAt: true } }),
    prisma.invoice.groupBy({ by: ["type"], _sum: { grandTotal: true }, where: { createdAt: { gte: startToday }, ...taxF } }),
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { paidDate: { gte: startToday }, agreement: { invoice: { ...taxF } } } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { createdAt: { gte: startToday }, ...taxF } },
      select: { qty: true, product: { select: { costPrice: true } } },
    }),
    prisma.invoiceItem.groupBy({
      by: ["nameSnapshot"],
      _sum: { qty: true, lineTotal: true },
      where: { invoice: { createdAt: { gte: startWeek }, ...taxF } },
    }),
    prisma.invoice.groupBy({
      by: ["soldByEmployeeId"],
      _sum: { grandTotal: true },
      where: { createdAt: { gte: startWeek }, soldByEmployeeId: { not: null }, ...taxF },
    }),
    prisma.employee.findMany({ select: { id: true, name: true } }),
    prisma.purchase.findMany({
      where: { status: { in: ["CREDIT", "PARTIAL"] }, creditDueDate: { not: null } },
      include: { supplier: { select: { name: true } } },
    }),
    // Refunds follow the same tax filter as today's sales so the profit figure
    // stays consistent when the non-taxable switch is off. The invoice relation
    // is optional, so the filter is only added when narrowing.
    prisma.salesReturn.aggregate({
      _sum: { totalRefund: true },
      where: { date: { gte: startToday }, ...(ntEnabled ? {} : { invoice: taxF }) },
    }),
    prisma.salesReturnItem.findMany({
      where: { return: { date: { gte: startToday }, ...(ntEnabled ? {} : { invoice: taxF }) } },
      select: { qty: true, product: { select: { costPrice: true } } },
    }),
  ]);

  const agStates = agreements.map((a) => ({
    a,
    s: computeCreditState(
      {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      },
      a.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate })),
    ),
  }));
  const outstanding = agStates.reduce((sum, x) => sum + x.s.outstanding, 0);
  const overdueList = agStates.filter((x) => x.s.isOverdue && !x.s.isSettled).slice(0, 4);

  // Payments due within the next 7 days (or already overdue).
  // Supplier bills we owe — includes overdue (not surfaced elsewhere).
  const supplierDueList = supplierCredits
    .map((p) => ({
      p,
      balance: toNum(p.total) - toNum(p.amountPaid),
      days: differenceInCalendarDays(p.creditDueDate!, now),
    }))
    .filter((x) => x.balance > 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  // Customer credit approaching its interest-free deadline (overdue ones are in
  // "Needs attention" already, so only show the upcoming 0–7 day window here).
  const customerDueList = agStates
    .map((x) => ({ ...x, days: differenceInCalendarDays(x.s.graceEndDate, now) }))
    .filter((x) => !x.s.isSettled && x.s.outstanding > 0 && x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  const lowStockAll = lowStockProductsRaw
    .filter((p) => p.quantityInStock <= p.reorderLevel)
    .sort((a, b) => a.quantityInStock - b.quantityInStock);
  const lowStockProducts = lowStockAll.slice(0, 5);
  const lowStockTotal = lowStockAll.length;

  const pct = (curr: number, prev: number) => (prev <= 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100));
  const todayVal = toNum(todaySales._sum.grandTotal);
  const weekVal = toNum(weekSales._sum.grandTotal);
  const monthVal = toNum(monthSales._sum.grandTotal);
  const todayDiff = pct(todayVal, toNum(yesterdaySales._sum.grandTotal));
  const weekDiff = pct(weekVal, toNum(lastWeekSales._sum.grandTotal));
  const monthDiff = pct(monthVal, toNum(lastMonthSales._sum.grandTotal));

  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const todayKey = businessDayKey(now);
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(startToday, -(6 - i));
    const key = businessDayKey(d);
    const total = dailyInvoicesRaw
      .filter((inv) => businessDayKey(inv.createdAt) === key)
      .reduce((sum, inv) => sum + toNum(inv.grandTotal), 0);
    return { dayName: weekdays[businessWeekday(d)], total, isToday: key === todayKey };
  });

  // Cash vs credit split of today's sales.
  const cashToday = toNum(todayByType.find((t) => t.type === "CASH")?._sum.grandTotal);
  const cashShare = todayVal > 0 ? Math.round((cashToday / todayVal) * 100) : 0;

  // Cash actually collected today (credit instalment payments).
  const moneyIn = toNum(moneyInToday._sum.amount);

  // Today's gross profit ≈ revenue − cost of goods sold (at current cost),
  // corrected for customer returns: refunds come off revenue and the restocked
  // goods give their cost back.
  const todayCogs = todayItems.reduce((s, it) => s + it.qty * toNum(it.product?.costPrice), 0);
  const todayRefunds = toNum(todayRefundAgg._sum.totalRefund);
  const todayReturnedCogs = todayReturnedItems.reduce(
    (s, it) => s + it.qty * toNum(it.product?.costPrice),
    0,
  );
  const todayProfit = todayVal - todayRefunds - (todayCogs - todayReturnedCogs);

  // Top products this week (by revenue) — aggregated in the DB via groupBy.
  const topProducts = weekItems
    .map((g) => ({ name: g.nameSnapshot, qty: g._sum.qty ?? 0, revenue: toNum(g._sum.lineTotal) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  // Top sellers this week (by attributed sales).
  const empName = new Map(employees.map((e) => [e.id, e.name]));
  const topSellers = weekByEmployee
    .map((r) => ({ name: empName.get(r.soldByEmployeeId ?? "") ?? "—", total: toNum(r._sum.grandTotal) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const k = (n: number) => formatLKR(n).replace(".00", "");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-muted">Your shop at a glance — sales, credit and stock.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/invoices/new">
            <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
              <Plus className="h-4 w-4" /> New Sale
            </button>
          </Link>
          <Link href="/reports">
            <button className="rounded-xl border border-input-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-input">
              View Reports
            </button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Hero — Today's sales */}
        <div className="relative flex h-40 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent p-5 text-white shadow-[0_4px_18px_rgba(30,41,74,0.12)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(30,41,74,0.18)] transition-all duration-300 group">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/85">Today&apos;s Sales</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white group-hover:scale-105 transition-transform duration-300">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <h2 className="tabular text-[26px] font-extrabold leading-none tracking-tight group-hover:translate-x-0.5 transition-transform duration-300">{k(todayVal)}</h2>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
              {todayDiff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {todayDiff >= 0 ? "+" : ""}
              {todayDiff}%
            </span>
            <span className="text-[11px] font-medium text-white/85">
              {todayVal > 0 ? `Cash ${cashShare}% · Credit ${100 - cashShare}%` : `${todaySales._count} invoice(s) · vs yesterday`}
            </span>
          </div>
        </div>

        <KpiCard label="This Week" value={k(weekVal)} diff={weekDiff} sub="vs last week" />
        <KpiCard label="This Month" value={k(monthVal)} diff={monthDiff} sub="vs last month" />

        {/* Outstanding credit */}
        <div className="flex h-40 flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)] hover:-translate-y-0.5 hover:shadow-md hover:border-clay/20 transition-all duration-300 group">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Outstanding Credit</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-clay-soft text-clay group-hover:scale-105 transition-transform duration-300">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <h2 className="tabular text-[26px] font-extrabold leading-none tracking-tight text-foreground group-hover:translate-x-0.5 transition-transform duration-300">{k(outstanding)}</h2>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-clay-soft px-2 py-0.5 text-[10px] font-bold text-clay-ink">
              {agStates.filter((x) => !x.s.isSettled).length} active
            </span>
            <span className="text-[11px] font-medium text-faint">{overdueList.length} overdue</span>
          </div>
        </div>
      </div>

      {/* Secondary KPIs — cash collected & profit today */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-primary-soft text-primary-ink">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Money collected today</div>
              <div className="text-[11px] text-faint">{moneyInToday._count} credit payment(s)</div>
            </div>
          </div>
          <span className="tabular text-xl font-extrabold text-foreground">{k(moneyIn)}</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-clay-soft text-clay-ink">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Gross profit today</div>
              <div className="text-[11px] text-faint">Sales − cost of goods</div>
            </div>
          </div>
          <span className={`tabular text-xl font-extrabold ${todayProfit < 0 ? "text-danger" : "text-foreground"}`}>
            {k(todayProfit)}
          </span>
        </div>
      </div>

      {/* Chart + needs attention */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)] lg:col-span-2">
          <h3 className="text-[15px] font-bold text-foreground">Sales — last 7 days</h3>
          <p className="mt-0.5 text-[11px] text-faint">Daily total across all invoices</p>
          <div className="mt-4">
            <SalesChart
              data={chartData.map((d) => ({ label: d.dayName, total: d.total, highlight: d.isToday }))}
            />
          </div>
        </div>

        {/* Needs attention */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
          <h3 className="text-[15px] font-bold text-foreground">Needs attention</h3>
          <div className="mt-4 space-y-2">
            {overdueList.length === 0 && lowStockProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted">
                <CheckCircle2 className="mb-2 h-8 w-8 text-primary/40" />
                All good — nothing overdue, stock healthy.
              </div>
            )}
            {overdueList.map((x) => (
              <Link
                key={x.a.id}
                href={`/credit/${x.a.id}`}
                className="flex items-center justify-between gap-2 rounded-xl bg-danger-soft px-3 py-2.5 transition-opacity hover:opacity-80"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{x.a.customer.name}</span>
                    <span className="tabular block text-[11px] text-danger-ink">Overdue · {formatLKR(x.s.outstanding)}</span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-danger/60" />
              </Link>
            ))}
            {lowStockProducts.map((p) => (
              <Link
                key={p.id}
                href="/products"
                className="flex items-center justify-between gap-2 rounded-xl bg-clay-soft px-3 py-2.5 transition-opacity hover:opacity-80"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Package className="h-4 w-4 shrink-0 text-clay" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{p.name}</span>
                    <span className="block font-mono text-[11px] text-clay-ink">{p.code} · {p.quantityInStock} left</span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-clay/60" />
              </Link>
            ))}
            {lowStockTotal > lowStockProducts.length && (
              <Link
                href="/reports"
                className="flex items-center justify-center gap-1 pt-1 text-[12px] font-semibold text-muted transition-colors hover:text-foreground"
              >
                View all {lowStockTotal} low-stock items
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Payments due soon */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-clay" />
            <h3 className="text-[15px] font-bold text-foreground">You owe suppliers — due soon</h3>
          </div>
          <p className="mt-0.5 text-[11px] text-faint">Credit purchases due in the next 7 days or overdue</p>
          <div className="mt-3 space-y-1.5">
            {supplierDueList.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">Nothing due in the next 7 days.</p>
            ) : (
              supplierDueList.map((x) => (
                <Link
                  key={x.p.id}
                  href={`/purchases/${x.p.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-input/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{x.p.supplier.name}</span>
                    <span className="block text-[11px] text-muted">
                      {formatDate(x.p.creditDueDate!)}
                      {x.p.supplierInvoiceNo ? ` · ${x.p.supplierInvoiceNo}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-[13px] font-bold text-foreground">{k(x.balance)}</span>
                    <Badge tone={x.days <= 1 ? "red" : "amber"}>{dueLabel(x.days)}</Badge>
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-[15px] font-bold text-foreground">Customers owe you — due soon</h3>
          </div>
          <p className="mt-0.5 text-[11px] text-faint">Credit reaching its interest-free deadline within 7 days</p>
          <div className="mt-3 space-y-1.5">
            {customerDueList.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">No customer credit due in the next 7 days.</p>
            ) : (
              customerDueList.map((x) => (
                <Link
                  key={x.a.id}
                  href={`/credit/${x.a.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-input/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{x.a.customer.name}</span>
                    <span className="block text-[11px] text-muted">Interest-free until {formatDate(x.s.graceEndDate)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-[13px] font-bold text-foreground">{k(x.s.outstanding)}</span>
                    <Badge tone={x.days <= 1 ? "red" : "amber"}>{dueLabel(x.days)}</Badge>
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top sellers & products this week */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-clay" />
            <h3 className="text-[15px] font-bold text-foreground">Top sellers — this week</h3>
          </div>
          <div className="mt-3 space-y-1">
            {topSellers.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">No attributed sales yet this week.</p>
            ) : (
              topSellers.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-input/60">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary-ink">
                      {i + 1}
                    </span>
                    {s.name}
                  </span>
                  <span className="tabular text-[13px] font-bold text-foreground">{k(s.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h3 className="text-[15px] font-bold text-foreground">Top products — this week</h3>
          </div>
          <div className="mt-3 space-y-1">
            {topProducts.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">No sales yet this week.</p>
            ) : (
              topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-input/60">
                  <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-clay-soft text-[11px] font-bold text-clay-ink">
                      {i + 1}
                    </span>
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-faint">×{p.qty}</span>
                  </span>
                  <span className="tabular text-[13px] font-bold text-foreground">{k(p.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent invoices */}
      <div className="rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(30,41,74,0.05)]">
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-[15px] font-bold text-foreground">Recent invoices</h3>
          <Link href="/invoices" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {recentInvoices.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">No invoices yet. Create your first sale.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border-subtle text-left text-[11px] font-bold uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-5 py-3 font-bold">Invoice</th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  {ntEnabled && <th className="px-4 py-3 font-bold">Book</th>}
                  <th className="px-4 py-3 font-bold">Type</th>
                  <th className="px-4 py-3 text-right font-bold">Total</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border-subtle transition-colors last:border-0 hover:bg-input/60">
                    <td className="px-5 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-mono text-xs font-bold text-primary-ink hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{inv.customer?.name ?? "Walk-in"}</td>
                    {ntEnabled && (
                      <td className="px-4 py-3">
                        <Badge tone={inv.taxCategory === "TAXABLE" ? "green" : "amber"}>
                          {inv.taxCategory === "TAXABLE" ? "TX" : "NT"}
                        </Badge>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Badge tone={inv.type === "CREDIT" ? "amber" : "green"}>{inv.type}</Badge>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold text-foreground">{formatLKR(inv.grandTotal)}</td>
                    <td className="px-5 py-3 text-faint">{formatDate(inv.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, diff, sub }: { label: string; value: string; diff: number; sub: string }) {
  return (
    <div className="flex h-40 flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)] hover:-translate-y-0.5 hover:shadow-md hover:border-primary/20 transition-all duration-300 group">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-border-subtle text-muted group-hover:bg-primary-soft group-hover:text-primary-ink transition-colors duration-300">
          <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
        </div>
      </div>
      <h2 className="tabular text-[26px] font-extrabold leading-none tracking-tight text-foreground group-hover:translate-x-0.5 transition-transform duration-300">{value}</h2>
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            diff >= 0 ? "bg-primary-soft text-primary-ink" : "bg-danger-soft text-danger-ink"
          }`}
        >
          {diff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {diff >= 0 ? "+" : ""}
          {diff}%
        </span>
        <span className="text-[11px] font-medium text-faint">{sub}</span>
      </div>
    </div>
  );
}
