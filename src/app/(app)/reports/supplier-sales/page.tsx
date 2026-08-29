import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, Boxes, Download, FileText, PackageSearch, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { requireStaffFinanceAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays, businessDayKey, businessStartOfMonth, businessStartOfWeek } from "@/lib/dates";
import { getSupplierSalesReport, type SupplierSalesReportOptions } from "@/lib/supplier-sales";
import { aggregateSupplierSales, type UnitQuantities } from "@/lib/supplier-sales-analytics";
import { formatDateTime, formatLKR } from "@/lib/utils";
import { formatQuantity, UNIT_LABELS } from "@/lib/units";
import { SupplierDailyTrendChart, SupplierTopProductsChart } from "@/components/supplier-sales-charts";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

type SearchParams = { from?: string; to?: string; supplier?: string; product?: string; activity?: string; page?: string };

function dayInput(date: Date) { return businessDayKey(date); }
function moneyClass(value: number) { return value < 0 ? "text-danger-ink" : ""; }
function queryString(filters: SupplierSalesReportOptions, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.supplier && filters.supplier !== "all") params.set("supplier", filters.supplier);
  if (filters.product && filters.product !== "all") params.set("product", filters.product);
  if (filters.activity && filters.activity !== "all") params.set("activity", filters.activity);
  Object.entries(extra).forEach(([key, value]) => value === undefined ? params.delete(key) : params.set(key, String(value)));
  return params.toString();
}
function quantitySummary(values: UnitQuantities) {
  const rows = Object.entries(values).filter(([, value]) => Math.abs(value) > 0.00001);
  return rows.length ? rows.map(([unit, value]) => `${formatQuantity(value, unit as keyof UnitQuantities)}`).join(" · ") : "0";
}

export default async function SupplierSalesExplorerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaffFinanceAccess();
  const raw = await searchParams;
  const now = new Date();
  const currentMonthStart = businessStartOfMonth(now);
  const defaults = { from: dayInput(currentMonthStart), to: dayInput(now) };
  const activity = raw.activity === "sales" || raw.activity === "returns" ? raw.activity : "all";
  const filters: SupplierSalesReportOptions = { from: raw.from ?? defaults.from, to: raw.to ?? defaults.to, supplier: raw.supplier ?? "all", product: raw.product ?? "all", activity };
  const [report, suppliers, products] = await Promise.all([
    getSupplierSalesReport(null, filters),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { active: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true } }),
  ]);
  filters.from = businessDayKey(report.start);
  filters.to = businessDayKey(addDays(report.end, -1));

  const analytics = aggregateSupplierSales(report.details);
  const selectedSupplier = filters.supplier === "unassigned"
    ? "Unassigned supplier"
    : suppliers.find((supplier) => supplier.id === filters.supplier)?.name ?? (filters.supplier?.startsWith("snapshot:") ? filters.supplier.slice(9) : "All suppliers");
  const selectedProduct = products.find((product) => product.id === filters.product);
  const periodLabel = filters.from === filters.to ? filters.from : `${filters.from} – ${filters.to}`;
  const inferred = report.totals.inferredLineCount;
  const unassigned = report.totals.unassignedLineCount;

  const sortedActivity = [...report.details].sort((a, b) => b.date.getTime() - a.date.getTime() || b.invoiceNumber.localeCompare(a.invoiceNumber));
  const requestedPage = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);
  const pageCount = Math.max(1, Math.ceil(sortedActivity.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const transactions = sortedActivity.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const today = dayInput(now);
  const weekStart = dayInput(businessStartOfWeek(now));
  const thisMonth = dayInput(currentMonthStart);
  const lastMonthEndDate = addDays(currentMonthStart, -1);
  const lastMonthStart = dayInput(businessStartOfMonth(lastMonthEndDate));
  const lastMonthEnd = dayInput(lastMonthEndDate);
  const presetHref = (from: string, to: string) => `/reports/supplier-sales?${queryString(filters, { from, to, page: undefined })}`;
  const exportQuery = queryString(filters);

  return (
    <div className="space-y-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/reports?month=${filters.from?.slice(0, 7)}`} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Reports</Link>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Supplier sales explorer</h1>
          <p className="mt-1 text-sm text-muted"><span className="font-semibold text-foreground">{selectedSupplier}</span> · {periodLabel}{selectedProduct ? ` · ${selectedProduct.code} ${selectedProduct.name}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/export/supplier-sales/xlsx?${exportQuery}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="h-4 w-4" /> Excel</a>
          <a href={`/api/export/supplier-sales/pdf?${exportQuery}`} className={buttonVariants({ variant: "outline", size: "sm" })}><FileText className="h-4 w-4" /> PDF</a>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-xl border border-primary/25 bg-[#172238] text-white shadow-[inset_0_1px_rgba(255,255,255,0.08)] dark:bg-[#111923] sm:grid-cols-3" aria-label="Active ledger context">
        <div className="border-b border-white/10 px-4 py-3 sm:border-b-0 sm:border-r"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">Ledger period</p><p className="mt-1 font-mono text-sm font-bold text-white">{periodLabel}</p></div>
        <div className="border-b border-white/10 px-4 py-3 sm:border-b-0 sm:border-r"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">Supplier scope</p><p className="mt-1 truncate text-sm font-bold text-white">{selectedSupplier}</p></div>
        <div className="px-4 py-3"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">Activity ledger</p><p className="mt-1 text-sm font-bold capitalize text-white">{activity === "all" ? "Sales + returns" : `${activity} only`}</p></div>
      </section>

      <Card className="border-l-4 border-l-primary">
        <CardContent className="py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-faint">Quick range</span>
            <Link href={presetHref(today, today)} className={buttonVariants({ variant: "ghost", size: "sm" })}>Today</Link>
            <Link href={presetHref(weekStart, today)} className={buttonVariants({ variant: "ghost", size: "sm" })}>This week</Link>
            <Link href={presetHref(thisMonth, today)} className={buttonVariants({ variant: "ghost", size: "sm" })}>This month</Link>
            <Link href={presetHref(lastMonthStart, lastMonthEnd)} className={buttonVariants({ variant: "ghost", size: "sm" })}>Last month</Link>
          </div>
          <form method="get" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_1.6fr_1fr_auto_auto]">
            <label className="text-xs font-semibold text-muted">From<Input type="date" name="from" max={today} defaultValue={filters.from ?? defaults.from} className="mt-1" /></label>
            <label className="text-xs font-semibold text-muted">To<Input type="date" name="to" max={today} defaultValue={filters.to ?? defaults.to} className="mt-1" /></label>
            <label className="text-xs font-semibold text-muted">Supplier<Select name="supplier" defaultValue={filters.supplier ?? "all"} className="mt-1"><option value="all">All suppliers</option><option value="unassigned">Unassigned supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></label>
            <label className="text-xs font-semibold text-muted">Product<Select name="product" defaultValue={filters.product ?? "all"} className="mt-1"><option value="all">All products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}</Select></label>
            <label className="text-xs font-semibold text-muted">Activity<Select name="activity" defaultValue={activity} className="mt-1"><option value="all">Sales & returns</option><option value="sales">Sales only</option><option value="returns">Returns only</option></Select></label>
            <Button type="submit">Apply</Button>
            <Link href="/reports/supplier-sales" className={buttonVariants({ variant: "ghost", size: "md" })}>Reset</Link>
          </form>
        </CardContent>
      </Card>

      {(inferred > 0 || unassigned > 0) && <div className="flex flex-wrap gap-2 rounded-xl border border-clay/20 bg-clay-soft px-4 py-3 text-xs text-clay-ink"><span className="font-bold">Attribution note:</span>{inferred > 0 && <span>{inferred} historical line{inferred === 1 ? "" : "s"} inferred from the supplier assigned during migration.</span>}{unassigned > 0 && <span>{unassigned} line{unassigned === 1 ? "" : "s"} remain unassigned and are included in totals.</span>}</div>}

      <section className="grid grid-cols-2 gap-3 border-y border-border py-3 lg:grid-cols-4" aria-label="Supplier sales key figures">
        <StatCard label="Invoices" value={String(report.totals.invoiceCount)} hint={`${report.totals.productCount} distinct products`} icon={ReceiptText} />
        <StatCard label="Net sales" value={formatLKR(report.totals.netSales)} valueClassName="whitespace-nowrap text-[clamp(0.68rem,3vw,1.5rem)] tracking-tighter" compactOnMobile icon={WalletCards} tone="blue" />
        <StatCard label="Net COGS" value={formatLKR(report.totals.cogs)} valueClassName="whitespace-nowrap text-[clamp(0.68rem,3vw,1.5rem)] tracking-tighter" compactOnMobile icon={Boxes} tone="amber" />
        <StatCard label="Gross profit" value={formatLKR(report.totals.grossProfit)} valueClassName="whitespace-nowrap text-[clamp(0.68rem,3vw,1.5rem)] tracking-tighter" compactOnMobile icon={TrendingUp} tone={report.totals.grossProfit >= 0 ? "green" : "red"} />
        <StatCard label="Gross margin" value={`${report.totals.marginPct.toFixed(1)}%`} hint="Profit ÷ net sales" icon={BarChart3} />
        <StatCard
          label={activity === "returns" ? "Returned quantity" : "Sold quantity"}
          value={activity === "returns" ? quantitySummary(analytics.returned) : quantitySummary(analytics.sold)}
          hint={activity === "all" ? `Returned ${quantitySummary(analytics.returned)}` : activity === "sales" ? "Sales activity only" : "Returns activity only"}
          valueClassName="text-lg leading-tight"
          icon={PackageSearch}
        />
      </section>

      {report.details.length === 0 ? (
        <Card><CardContent className="py-14 text-center"><PackageSearch className="mx-auto h-9 w-9 text-faint" /><h2 className="mt-3 font-bold">No supplier activity matches these filters</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted">Try a wider date range, choose all suppliers, or include both sales and returns.</p><Link href="/reports/supplier-sales" className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`}>Reset filters</Link></CardContent></Card>
      ) : <>
        <section className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Daily net sales vs gross profit</CardTitle><p className="mt-1 text-xs text-muted">Returns appear on the day they were recorded, preserving the operational ledger.</p></CardHeader><CardContent><SupplierDailyTrendChart data={analytics.daily} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Top products by net sales</CardTitle><p className="mt-1 text-xs text-muted">Top eight products within the current filter context.</p></CardHeader><CardContent><SupplierTopProductsChart data={analytics.products} /></CardContent></Card>
        </section>

        <Card className="border-t-4 border-t-primary">
          <CardHeader className="bg-primary-soft/35"><div className="flex items-center gap-3"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Performance ledger</span><span className="h-px flex-1 bg-primary/20" /></div><CardTitle className="mt-1">Product profitability matrix</CardTitle><p className="mt-1 text-xs text-muted">Quantities remain separated by unit. Identity and action columns stay visible while you inspect the ledger.</p></CardHeader>
          <CardContent className="p-0"><Table scrollHint containerClassName="max-h-[640px]" className="min-w-[1080px] text-xs"><THead className="sticky top-0 z-20 bg-surface shadow-[0_1px_0_var(--color-border)]"><TR><TH className="sticky left-0 z-30 min-w-48 border-r border-border bg-surface px-3">Product</TH><TH className="px-2">Unit</TH><TH className="px-2 text-right">Invoices</TH><TH className="px-2 text-right">Sold</TH><TH className="px-2 text-right">Returned</TH><TH className="px-2 text-right">Net qty</TH><TH className="px-2 text-right">Sales</TH><TH className="px-2 text-right">Returns</TH><TH className="px-2 text-right">Net sales</TH><TH className="px-2 text-right">Net COGS</TH><TH className="bg-primary-soft/60 px-2 text-right">Profit</TH><TH className="sticky right-[58px] z-30 min-w-[62px] border-l border-border bg-surface px-2 text-right">Margin</TH><TH className="sticky right-0 z-30 min-w-[58px] border-l border-border bg-surface px-2 text-right">Action</TH></TR></THead><TBody>{analytics.products.map((row) => <TR key={`${row.productId}:${row.unit}`}><TD className="sticky left-0 z-10 border-r border-border bg-surface px-3"><span className="block max-w-44 truncate font-medium" title={row.productName}>{row.productName}</span><span className="whitespace-nowrap font-mono text-[11px] text-faint">{row.productCode || "No code"}</span></TD><TD className="px-2 font-mono">{UNIT_LABELS[row.unit]}</TD><TD className="px-2 text-right font-mono tabular-nums">{row.invoiceCount}</TD><TD className="px-2 text-right font-mono tabular-nums">{formatQuantity(row.quantitySold, row.unit)}</TD><TD className="px-2 text-right font-mono tabular-nums text-danger-ink">{formatQuantity(row.quantityReturned, row.unit)}</TD><TD className="px-2 text-right font-mono font-bold tabular-nums">{formatQuantity(row.netQuantity, row.unit)}</TD><TD className="px-2 text-right font-mono tabular-nums">{formatLKR(row.sales)}</TD><TD className="px-2 text-right font-mono tabular-nums text-danger-ink">{formatLKR(row.returns)}</TD><TD className={`px-2 text-right font-mono font-bold tabular-nums ${moneyClass(row.netSales)}`}>{formatLKR(row.netSales)}</TD><TD className="px-2 text-right font-mono tabular-nums">{formatLKR(row.netCogs)}</TD><TD className={`bg-primary-soft/25 px-2 text-right font-mono font-bold tabular-nums ${moneyClass(row.grossProfit)}`}>{formatLKR(row.grossProfit)}</TD><TD className="sticky right-[58px] z-10 border-l border-border bg-surface px-2 text-right font-mono tabular-nums">{row.marginPct.toFixed(1)}%</TD><TD className="sticky right-0 z-10 border-l border-border bg-surface px-2 text-right">{row.productId && <Link href={`/reports/supplier-sales?${queryString(filters, { product: row.productId, page: undefined })}`} className="text-xs font-bold text-primary hover:underline">Focus</Link>}</TD></TR>)}</TBody></Table></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily breakdown</CardTitle></CardHeader>
          <CardContent className="p-0"><Table scrollHint containerClassName="max-h-[560px]" className="min-w-[920px]"><THead className="sticky top-0 z-20 bg-surface shadow-[0_1px_0_var(--color-border)]"><TR><TH className="sticky left-0 z-30 min-w-32 bg-surface">Date</TH><TH className="text-right">Invoices</TH><TH>Sold quantities</TH><TH>Returned quantities</TH><TH className="text-right">Net sales</TH><TH className="text-right">Net COGS</TH><TH className="bg-primary-soft/60 text-right">Profit</TH><TH className="text-right">Margin</TH></TR></THead><TBody>{analytics.daily.map((row) => <TR key={row.day}><TD className="sticky left-0 z-10 whitespace-nowrap bg-surface font-mono font-medium">{row.day}</TD><TD className="text-right font-mono">{row.invoiceCount}</TD><TD className="whitespace-nowrap font-mono text-xs">{quantitySummary(row.sold)}</TD><TD className="whitespace-nowrap font-mono text-xs text-danger-ink">{quantitySummary(row.returned)}</TD><TD className={`text-right font-mono font-bold ${moneyClass(row.netSales)}`}>{formatLKR(row.netSales)}</TD><TD className="text-right font-mono">{formatLKR(row.netCogs)}</TD><TD className={`bg-primary-soft/25 text-right font-mono font-bold ${moneyClass(row.grossProfit)}`}>{formatLKR(row.grossProfit)}</TD><TD className="text-right font-mono">{row.marginPct.toFixed(1)}%</TD></TR>)}</TBody></Table></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><div><CardTitle>Transaction activity</CardTitle><p className="mt-1 text-xs text-muted">Auditable invoice and return lines · {sortedActivity.length} record{sortedActivity.length === 1 ? "" : "s"}</p></div><span className="font-mono text-xs text-faint">Page {page} / {pageCount}</span></CardHeader>
          <CardContent className="p-0">
            <Table scrollHint containerClassName="max-h-[720px]" className="min-w-[1420px] text-xs">
              <THead className="sticky top-0 z-30 bg-surface shadow-[0_1px_0_var(--color-border)]"><TR>
                <TH className="sticky left-0 z-40 min-w-36 border-r border-border bg-surface px-3">Date / time</TH><TH className="px-2">Activity</TH><TH className="px-2">Invoice</TH><TH className="px-2">Supplier</TH><TH className="px-2">Product</TH><TH className="px-2">Customer</TH><TH className="px-2">Cashier</TH><TH className="px-2">Salesperson</TH><TH className="px-2">Sale type</TH><TH className="px-2 text-right">Quantity</TH><TH className="px-2 text-right">Sales</TH><TH className="px-2 text-right">Returns</TH><TH className="px-2 text-right">Net COGS</TH><TH className="sticky right-[116px] z-40 min-w-28 border-l border-border bg-primary-soft px-2 text-right">Profit</TH><TH className="sticky right-0 z-40 min-w-[116px] bg-surface px-2">Attribution</TH>
              </TR></THead>
              <TBody>{transactions.map((row, index) => {
                const netCogs = row.cogs - row.returnedCogs;
                const profit = row.sales - row.returns - netCogs;
                return <TR key={`${row.kind}:${row.invoiceNumber}:${row.productId}:${row.date.toISOString()}:${index}`}>
                  <TD className="sticky left-0 z-20 whitespace-nowrap border-r border-border bg-surface px-3 text-xs">{formatDateTime(row.date)}</TD><TD className="px-2"><Badge tone={row.kind === "SALE" ? "green" : "red"}>{row.kind}</Badge></TD><TD className="px-2">{row.invoiceId ? <Link href={`/invoices/${row.invoiceId}`} className="whitespace-nowrap font-mono text-xs font-bold text-primary hover:underline">{row.invoiceNumber}</Link> : <span className="text-xs text-muted">{row.invoiceNumber}</span>}</TD><TD className="max-w-36 truncate px-2 font-medium" title={row.supplierName}>{row.supplierName}</TD><TD className="max-w-48 px-2"><span className="block truncate font-medium" title={row.productName}>{row.productName}</span><span className="whitespace-nowrap font-mono text-[11px] text-faint">{row.productCode}</span></TD><TD className="max-w-32 truncate px-2" title={row.customerName}>{row.customerName}</TD><TD className="max-w-28 truncate px-2" title={row.cashierName}>{row.cashierName}</TD><TD className="max-w-28 truncate px-2" title={row.salespersonName}>{row.salespersonName}</TD><TD className="px-2"><Badge>{row.saleType.replaceAll("_", " ")}</Badge></TD><TD className="whitespace-nowrap px-2 text-right font-mono">{formatQuantity(Math.abs(row.quantity), row.unit)}</TD><TD className="whitespace-nowrap px-2 text-right font-mono">{formatLKR(row.sales)}</TD><TD className="whitespace-nowrap px-2 text-right font-mono text-danger-ink">{formatLKR(row.returns)}</TD><TD className="whitespace-nowrap px-2 text-right font-mono">{formatLKR(netCogs)}</TD><TD className={`sticky right-[116px] z-20 whitespace-nowrap border-l border-border bg-primary-soft px-2 text-right font-mono font-bold ${moneyClass(profit)}`}>{formatLKR(profit)}</TD><TD className="sticky right-0 z-20 bg-surface px-2">{row.attribution === "LEGACY_INFERRED" ? <Badge tone="amber">Legacy inferred</Badge> : row.supplierId ? <Badge tone="blue">Captured</Badge> : <Badge>Unassigned</Badge>}</TD>
                </TR>;
              })}</TBody>
            </Table>
          </CardContent>
          {pageCount > 1 && <div className="flex items-center justify-between border-t border-border-subtle px-5 py-4"><Link aria-disabled={page === 1} href={page === 1 ? "#" : `/reports/supplier-sales?${queryString(filters, { page: page - 1 })}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page === 1 ? "pointer-events-none opacity-50" : ""}`}><ArrowLeft className="h-4 w-4" /> Previous</Link><span className="text-xs text-muted">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedActivity.length)} of {sortedActivity.length}</span><Link aria-disabled={page === pageCount} href={page === pageCount ? "#" : `/reports/supplier-sales?${queryString(filters, { page: page + 1 })}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page === pageCount ? "pointer-events-none opacity-50" : ""}`}>Next <ArrowRight className="h-4 w-4" /></Link></div>}
        </Card>
      </>}
    </div>
  );
}
