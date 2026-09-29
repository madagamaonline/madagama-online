import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Download, LockKeyhole } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getTaxReport, type TaxTotals } from "@/lib/tax-report";
import { businessMonthKey } from "@/lib/dates";
import { formatDate, formatDateTime, formatLKR, formatNumber } from "@/lib/utils";
import { SalesChart } from "@/components/sales-chart";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const PAGE_SIZE = 40;
type Params = { month?: string; invoices?: string; purchases?: string; customerReturns?: string; supplierReturns?: string; activity?: string };

function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pageNumber(value: string | undefined, count: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, Math.max(1, Math.ceil(count / PAGE_SIZE))) : 1;
}

function pageHref(params: Params, month: string, section: string, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  query.set("month", month);
  query.set(section, String(page));
  return `/reports/tax-ledger?${query}#${section}`;
}

function Pager({ params, month, section, page, count }: { params: Params; month: string; section: string; page: number; count: number }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 text-xs text-muted">
    <span>{formatNumber(count)} records · page {page} of {pages}</span>
    <div className="flex gap-2">
      {page > 1 && <Link href={pageHref(params, month, section, page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link>}
      {page < pages && <Link href={pageHref(params, month, section, page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link>}
    </div>
  </div>;
}

function Money({ value, strong = false }: { value: number; strong?: boolean }) {
  return <span className={`whitespace-nowrap font-mono tabular-nums ${strong ? "font-bold" : ""}`}>{formatLKR(value)}</span>;
}

function Category({ category }: { category: "TAXABLE" | "NON_TAXABLE" | null }) {
  return category === "TAXABLE" ? <Badge tone="blue">Taxable</Badge> : category === "NON_TAXABLE" ? <Badge className="bg-amber-100 text-amber-950 dark:bg-amber-900/45 dark:text-amber-200">Non-taxable</Badge> : <Badge>Unclassified</Badge>;
}

function Reconciliation({ title, value, note }: { title: string; value: TaxTotals; note?: string }) {
  return <div className="border-b border-white/10 px-5 py-4 last:border-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
    <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-white/65">{title}</p>{note && <span className="text-[10px] text-white/50">{note}</span>}</div>
    <p className="mt-2 whitespace-nowrap text-xl font-extrabold tracking-tight text-white tabular-nums"><Money value={value.total} /></p>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="border-l-2 border-primary-400 pl-2"><dt className="text-white/65">Taxable</dt><dd className="mt-0.5 font-mono font-semibold text-white tabular-nums">{formatLKR(value.taxable)}</dd></div>
      <div className="border-l-2 border-amber-400 pl-2"><dt className="text-white/65">Non-taxable</dt><dd className="mt-0.5 font-mono font-semibold text-white tabular-nums">{formatLKR(value.nonTaxable)}</dd></div>
    </dl>
    {value.unclassified !== 0 && <p className="mt-2 text-xs text-white/75">Unclassified: {formatLKR(value.unclassified)}</p>}
  </div>;
}

function MatrixHead() {
  return <THead><TR><TH className="sticky left-0 z-10 bg-surface">Supplier</TH><TH>Gross</TH><TH>Returns</TH><TH>Net</TH></TR></THead>;
}

function MatrixValue({ value, emphasized = false }: { value: TaxTotals; emphasized?: boolean }) {
  return <TD className="min-w-44 align-top"><div className="space-y-1 text-xs">
    <div className="flex justify-between gap-3 text-primary"><span>Taxable</span><Money value={value.taxable} /></div>
    <div className="flex justify-between gap-3 text-amber-800 dark:text-amber-300"><span>Non-taxable</span><Money value={value.nonTaxable} /></div>
    {value.unclassified !== 0 && <div className="flex justify-between gap-3 text-muted"><span>Unclassified</span><Money value={value.unclassified} /></div>}
    <div className={`flex justify-between gap-3 border-t border-border-subtle pt-1 text-foreground ${emphasized ? "font-bold" : ""}`}><span>Total</span><Money value={value.total} strong={emphasized} /></div>
  </div></TD>;
}

export default async function TaxLedgerPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const report = await getTaxReport(params.month);
  const currentMonth = businessMonthKey(new Date());
  const prev = shiftMonth(report.month, -1);
  const next = shiftMonth(report.month, 1);
  const invoicePage = pageNumber(params.invoices, report.invoices.length);
  const purchasePage = pageNumber(params.purchases, report.purchaseLines.length);
  const customerReturnPage = pageNumber(params.customerReturns, report.customerReturnLines.length);
  const supplierReturnPage = pageNumber(params.supplierReturns, report.supplierReturnLines.length);
  const activityPage = pageNumber(params.activity, report.supplierSalesDetails.length);
  const invoiceRows = report.invoices.slice((invoicePage - 1) * PAGE_SIZE, invoicePage * PAGE_SIZE);
  const purchaseRows = report.purchaseLines.slice((purchasePage - 1) * PAGE_SIZE, purchasePage * PAGE_SIZE);
  const customerReturnRows = report.customerReturnLines.slice((customerReturnPage - 1) * PAGE_SIZE, customerReturnPage * PAGE_SIZE);
  const supplierReturnRows = report.supplierReturnLines.slice((supplierReturnPage - 1) * PAGE_SIZE, supplierReturnPage * PAGE_SIZE);
  const activityRows = [...report.supplierSalesDetails].sort((a, b) => b.date.getTime() - a.date.getTime()).slice((activityPage - 1) * PAGE_SIZE, activityPage * PAGE_SIZE);
  const chart = report.daily.map((row) => ({ label: row.day.slice(8), taxable: row.taxable, nonTaxable: row.nonTaxable, total: row.total }));

  return <main className="space-y-5 pb-12 print:space-y-3">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.17em] text-primary"><LockKeyhole className="h-3.5 w-3.5" /> Admin ledger</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Tax category ledger</h1>
        <p className="mt-1 text-sm text-muted">{report.label} · company and supplier detail</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex items-center rounded-lg border border-border bg-surface p-1">
          <Link href={`/reports/tax-ledger?month=${prev}`} aria-label="Previous month" className="rounded-md p-1.5 text-muted hover:bg-input hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-28 px-2 text-center text-xs font-bold text-foreground">{report.label}</span>
          {report.month < currentMonth ? <Link href={`/reports/tax-ledger?month=${next}`} aria-label="Next month" className="rounded-md p-1.5 text-muted hover:bg-input hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight className="h-4 w-4" /></Link> : <span className="p-1.5 text-faint"><ChevronRight className="h-4 w-4" /></span>}
        </div>
        <a href={`/api/export/tax-ledger/xlsx?month=${report.month}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="h-4 w-4" /> Detailed Excel</a>
      </div>
    </header>
    <p className="hidden border border-border px-3 py-2 text-xs print:block">Printed view includes only the register pages currently displayed below. For a complete monthly archive, use the Detailed Excel export.</p>

    <nav aria-label="Ledger sections" className="print:hidden">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-faint">Jump to a register</p>
      <div className="flex flex-wrap gap-2">
        {([
          ["#supplier-matrices", "Supplier totals", report.supplierSales.length + report.supplierPurchases.length],
          ["#invoices", "Invoices", report.invoices.length],
          ["#purchases", "Purchases", report.purchaseLines.length],
          ["#customerReturns", "Customer returns", report.customerReturnLines.length],
          ["#supplierReturns", "Supplier returns", report.supplierReturnLines.length],
          ["#activity", "Sales activity", report.supplierSalesDetails.length],
        ] as const).map(([href, label, count]) => <a key={href} href={href} className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary">{label} <span className="ml-1 font-mono text-muted">{formatNumber(count)}</span></a>)}
      </div>
    </nav>

    <section aria-label="Company category reconciliation" className="overflow-hidden rounded-xl bg-[#172238] shadow-[inset_0_1px_rgba(255,255,255,0.08)] lg:grid lg:grid-cols-3">
      <Reconciliation title="Gross sales" value={report.sales} note={`${report.invoiceCount.total} invoices`} />
      <Reconciliation title="Customer refunds" value={report.refunds} />
      <Reconciliation title="Net sales" value={report.netSales} />
    </section>
    <section aria-label="Purchasing reconciliation" className="grid gap-3 sm:grid-cols-3">
      {([ ["Purchases", report.purchases], ["Supplier returns", report.supplierReturns], ["Net purchases", report.netPurchases] ] as const).map(([label, totals]) => <div key={label} className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-lg font-extrabold text-foreground"><Money value={totals.total} /></p><p className="mt-2 text-xs text-muted">Taxable <span className="font-mono text-primary">{formatLKR(totals.taxable)}</span> · Non-taxable <span className="font-mono text-amber-800 dark:text-amber-300">{formatLKR(totals.nonTaxable)}</span></p></div>)}
    </section>

    <Card><CardHeader><CardTitle>Daily gross sales by category</CardTitle><p className="mt-1 text-xs text-muted">Invoice date within {report.label}; refunds appear in the reconciliation above.</p></CardHeader><CardContent><div style={{ "--color-clay": "#d97706" } as React.CSSProperties}>{chart.length ? <SalesChart data={chart} height={240} /> : <p className="py-9 text-center text-sm text-muted">No sales recorded this month.</p>}</div></CardContent></Card>

    <section id="supplier-matrices" className="scroll-mt-6 space-y-3">
      <div className="border-l-4 border-primary pl-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">01 / Reconciliation</p><h2 className="text-lg font-bold text-foreground">Supplier category totals</h2></div>
      <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Supplier-wise sales</CardTitle><p className="mt-1 text-xs text-muted">Merchandise attributed to suppliers; sales category follows the invoice.</p></CardHeader><CardContent className="p-0">{report.supplierSales.length ? <Table scrollHint className="min-w-[680px]"><MatrixHead /><TBody>{report.supplierSales.map((row) => <TR key={row.supplier}><TD className="sticky left-0 z-10 min-w-32 bg-surface font-semibold">{row.supplier}</TD><MatrixValue value={row.sales} /><MatrixValue value={row.returns} /><MatrixValue value={row.net} emphasized /></TR>)}</TBody></Table> : <p className="px-5 py-9 text-center text-sm text-muted">No supplier-attributed sales this month.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Supplier-wise purchases</CardTitle><p className="mt-1 text-xs text-muted">Purchase category uses the product’s current taxable flag.</p></CardHeader><CardContent className="p-0">{report.supplierPurchases.length ? <Table scrollHint className="min-w-[680px]"><MatrixHead /><TBody>{report.supplierPurchases.map((row) => <TR key={row.supplier}><TD className="sticky left-0 z-10 min-w-32 bg-surface font-semibold">{row.supplier}</TD><MatrixValue value={row.purchases} /><MatrixValue value={row.returns} /><MatrixValue value={row.net} emphasized /></TR>)}</TBody></Table> : <p className="px-5 py-9 text-center text-sm text-muted">No purchases this month.</p>}</CardContent></Card>
      </div>
    </section>

    <div className="border-l-4 border-primary pl-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">02 / Sales</p><h2 className="text-lg font-bold text-foreground">Invoice register</h2></div>
    <Card id="invoices" className="scroll-mt-6"><CardHeader><CardTitle>Invoice register</CardTitle><p className="mt-1 text-xs text-muted">All non-voided invoices in {report.label}; {report.invoiceCount.taxable} taxable and {report.invoiceCount.nonTaxable} non-taxable.</p></CardHeader><CardContent className="p-0">{invoiceRows.length ? <Table scrollHint className="min-w-[760px]"><THead><TR><TH>Date</TH><TH>Invoice</TH><TH>Customer</TH><TH>Type</TH><TH>Category</TH><TH className="text-right">Gross sale</TH></TR></THead><TBody>{invoiceRows.map((row) => <TR key={row.id}><TD className="whitespace-nowrap">{formatDateTime(row.createdAt)}</TD><TD><Link href={`/invoices/${row.id}`} className="font-mono font-semibold text-primary hover:underline">{row.invoiceNumber}</Link></TD><TD>{row.customer?.name ?? "Walk-in"}</TD><TD className="text-xs">{row.type.replaceAll("_", " ")}</TD><TD><Category category={row.taxCategory} /></TD><TD className="text-right"><Money value={Number(row.grandTotal)} strong /></TD></TR>)}</TBody></Table> : <p className="px-5 py-9 text-center text-sm text-muted">No invoices this month.</p>}</CardContent><Pager params={params} month={report.month} section="invoices" page={invoicePage} count={report.invoices.length} /></Card>

    <div className="border-l-4 border-amber-500 pl-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-300">03 / Purchasing</p><h2 className="text-lg font-bold text-foreground">Stock movement</h2></div>
    <Card id="purchases" className="scroll-mt-6"><CardHeader><CardTitle>Purchase line register</CardTitle><p className="mt-1 text-xs text-muted">Every product line, with its category and supplier.</p></CardHeader><CardContent className="p-0">{purchaseRows.length ? <Table scrollHint className="min-w-[880px]"><THead><TR><TH>Date</TH><TH>Supplier</TH><TH>Reference</TH><TH>Product</TH><TH className="text-right">Qty</TH><TH>Category</TH><TH className="text-right">Line value</TH></TR></THead><TBody>{purchaseRows.map((row, index) => <TR key={`${row.reference}:${row.product}:${index}`}><TD className="whitespace-nowrap">{formatDate(row.date)}</TD><TD className="font-semibold">{row.supplier}</TD><TD className="font-mono text-xs">{row.reference}</TD><TD>{row.product}</TD><TD className="text-right font-mono tabular-nums">{formatNumber(row.quantity)}</TD><TD><Category category={row.category} /></TD><TD className="text-right"><Money value={row.amount} strong /></TD></TR>)}</TBody></Table> : <p className="px-5 py-9 text-center text-sm text-muted">No purchase lines this month.</p>}</CardContent><Pager params={params} month={report.month} section="purchases" page={purchasePage} count={report.purchaseLines.length} /></Card>

    <div className="border-l-4 border-danger pl-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-danger-ink">04 / Returns</p><h2 className="text-lg font-bold text-foreground">Returned merchandise</h2></div>
    <section className="grid gap-4 xl:grid-cols-2">
      <Card id="customerReturns" className="scroll-mt-6"><CardHeader><CardTitle>Customer return lines</CardTitle><p className="mt-1 text-xs text-muted">Unlinked returns are unclassified; the reference is the return ID when no invoice exists.</p></CardHeader><CardContent className="p-0">{customerReturnRows.length ? <Table scrollHint className="min-w-[700px]"><THead><TR><TH>Date</TH><TH>Invoice / return</TH><TH>Product</TH><TH className="text-right">Qty</TH><TH>Category</TH><TH className="text-right">Value</TH></TR></THead><TBody>{customerReturnRows.map((row, index) => <TR key={`${row.reference}:${row.product}:${index}`}><TD className="whitespace-nowrap">{formatDate(row.date)}</TD><TD className="font-mono text-xs">{row.reference}</TD><TD className="font-semibold">{row.product}</TD><TD className="text-right font-mono tabular-nums">{formatNumber(row.quantity)}</TD><TD><Category category={row.category} /></TD><TD className="text-right"><Money value={row.amount} strong /></TD></TR>)}</TBody></Table> : <p className="px-5 py-9 text-center text-sm text-muted">No customer return lines this month.</p>}</CardContent><Pager params={params} month={report.month} section="customerReturns" page={customerReturnPage} count={report.customerReturnLines.length} /></Card>
      <Card id="supplierReturns" className="scroll-mt-6"><CardHeader><CardTitle>Supplier return lines</CardTitle><p className="mt-1 text-xs text-muted">Products returned to each supplier, categorized by their current taxable flag.</p></CardHeader><CardContent className="p-0">{supplierReturnRows.length ? <Table scrollHint className="min-w-[800px]"><THead><TR><TH>Date</TH><TH>Supplier</TH><TH>Return ID</TH><TH>Product</TH><TH className="text-right">Qty</TH><TH>Category</TH><TH className="text-right">Value</TH></TR></THead><TBody>{supplierReturnRows.map((row, index) => <TR key={`${row.reference}:${row.product}:${index}`}><TD className="whitespace-nowrap">{formatDate(row.date)}</TD><TD className="font-semibold">{row.supplier}</TD><TD className="font-mono text-xs">{row.reference}</TD><TD>{row.product}</TD><TD className="text-right font-mono tabular-nums">{formatNumber(row.quantity)}</TD><TD><Category category={row.category} /></TD><TD className="text-right"><Money value={row.amount} strong /></TD></TR>)}</TBody></Table> : <p className="px-5 py-9 text-center text-sm text-muted">No supplier return lines this month.</p>}</CardContent><Pager params={params} month={report.month} section="supplierReturns" page={supplierReturnPage} count={report.supplierReturnLines.length} /></Card>
    </section>

    <div className="border-l-4 border-primary pl-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">05 / Line detail</p><h2 className="text-lg font-bold text-foreground">Supplier-attributed activity</h2></div>
    <Card id="activity" className="scroll-mt-6"><CardHeader><CardTitle>Supplier-attributed sales & returns</CardTitle><p className="mt-1 text-xs text-muted">Line-level merchandise activity, including attribution and invoice category. Unlinked customer returns appear as unclassified in company totals.</p></CardHeader><CardContent className="p-0">{activityRows.length ? <Table scrollHint className="min-w-[1120px]"><THead><TR><TH>Date</TH><TH>Activity</TH><TH>Invoice</TH><TH>Supplier</TH><TH>Product</TH><TH>Customer</TH><TH>Category</TH><TH className="text-right">Qty</TH><TH className="text-right">Sale</TH><TH className="text-right">Return</TH><TH>Attribution</TH></TR></THead><TBody>{activityRows.map((row, index) => <TR key={`${row.kind}:${row.invoiceId}:${row.productId}:${index}`}><TD className="whitespace-nowrap">{formatDateTime(row.date)}</TD><TD><Badge tone={row.kind === "SALE" ? "green" : "red"}>{row.kind === "SALE" ? "Sale" : "Return"}</Badge></TD><TD>{row.invoiceId ? <Link href={`/invoices/${row.invoiceId}`} className="font-mono font-semibold text-primary hover:underline">{row.invoiceNumber}</Link> : <span className="font-mono">{row.invoiceNumber}</span>}</TD><TD>{row.supplierName}</TD><TD><span className="font-semibold">{row.productName}</span><span className="block font-mono text-[11px] text-faint">{row.productCode}</span></TD><TD>{row.customerName}</TD><TD><Category category={row.taxCategory} /></TD><TD className="text-right font-mono tabular-nums">{formatNumber(Math.abs(row.quantity))} {row.unit}</TD><TD className="text-right"><Money value={row.sales} /></TD><TD className="text-right"><Money value={row.returns} /></TD><TD className="text-xs">{row.attribution?.replaceAll("_", " ") ?? "Unassigned"}</TD></TR>)}</TBody></Table> : <p className="px-5 py-9 text-center text-sm text-muted">No supplier-attributed activity this month.</p>}</CardContent><Pager params={params} month={report.month} section="activity" page={activityPage} count={report.supplierSalesDetails.length} /></Card>

    <aside className="rounded-lg border border-clay/35 bg-clay-soft/40 px-4 py-3 text-xs leading-relaxed text-clay-ink"><strong>Classification note.</strong> Purchase and supplier return records do not store a historical tax category. Their category here is inferred from each product’s <em>current</em> taxable flag and can change if the product is edited. Unlinked customer returns cannot inherit an invoice category and are shown as unclassified. Purchase and supplier return header totals may differ from the sum of their item lines; this ledger categorizes item lines.</aside>
  </main>;
}
