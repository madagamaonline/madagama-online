import Link from "next/link";
import type { Prisma, TaxCategory } from "@prisma/client";
import { CircleDollarSign, Clock3, CreditCard, FilePlus2, Files } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { computeCreditState } from "@/lib/credit";
import { nonTaxableEnabled, invoiceTaxableWhere } from "@/lib/tax-mode";
import { cn, formatDate, formatLKR, toNum } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ListSearch } from "@/components/list-search";
import { Highlight } from "@/components/highlight";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type Lifecycle = "ACTIVE" | "OVERDUE" | "SETTLED" | "VOIDED";

const CATEGORY_FILTERS = [
  { label: "All categories", value: "" },
  { label: "Taxable", value: "TAXABLE" },
  { label: "Non-taxable", value: "NON_TAXABLE" },
] as const;

const LIFECYCLE_FILTERS: { label: string; value: "" | Lifecycle }[] = [
  { label: "All", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Settled", value: "SETTLED" },
  { label: "Voided", value: "VOIDED" },
];

function lifecycleBadge(lifecycle: Lifecycle) {
  if (lifecycle === "SETTLED") return <Badge tone="green">Settled</Badge>;
  if (lifecycle === "OVERDUE") return <Badge tone="red">Overdue</Badge>;
  if (lifecycle === "VOIDED") return <Badge tone="red">Voided · audit only</Badge>;
  return <Badge tone="amber">Active</Badge>;
}

export default async function CreditInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const { q, category, status } = await searchParams;
  const query = (q ?? "").trim();
  const ntEnabled = await nonTaxableEnabled();
  const cat = category === "TAXABLE" || category === "NON_TAXABLE" ? (category as TaxCategory) : undefined;
  const lifecycle = LIFECYCLE_FILTERS.some((filter) => filter.value === status)
    ? (status as Lifecycle | undefined)
    : undefined;

  const where: Prisma.InvoiceWhereInput = {
    type: "CREDIT",
    ...(cat ? { taxCategory: cat } : {}),
    ...invoiceTaxableWhere(ntEnabled),
    ...(query
      ? {
          OR: [
            { invoiceNumber: { contains: query, mode: "insensitive" } },
            { customer: { name: { contains: query, mode: "insensitive" } } },
            { customer: { phone: { contains: query, mode: "insensitive" } } },
            { customer: { nic: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true, phone: true, nic: true } },
      creditAgreement: {
        include: { payments: { select: { amount: true, discount: true, paidDate: true } } },
      },
    },
  });

  const allRows = invoices.map((invoice) => {
    const agreement = invoice.creditAgreement;
    const state = agreement
      ? computeCreditState(
          {
            principal: toNum(agreement.principal),
            startDate: agreement.startDate,
            interestRatePerMonth: toNum(agreement.interestRatePerMonth),
            interestFreeMonths: agreement.interestFreeMonths,
          },
          agreement.payments.map((payment) => ({
            amount: toNum(payment.amount),
            discount: toNum(payment.discount),
            paidDate: payment.paidDate,
          })),
        )
      : null;
    const collected = state?.totalPaid ?? toNum(invoice.amountPaid);
    const outstanding = state?.outstanding ?? Math.max(0, toNum(invoice.grandTotal) - collected);
    const rowLifecycle: Lifecycle =
      invoice.voidedAt || agreement?.status === "VOIDED"
        ? "VOIDED"
        : state?.isSettled || outstanding <= 0
          ? "SETTLED"
          : state?.isOverdue
            ? "OVERDUE"
            : "ACTIVE";
    const balanceTotal = collected + outstanding;
    const collectedPercent = balanceTotal > 0 ? Math.min(100, Math.max(0, (collected / balanceTotal) * 100)) : 100;

    return { invoice, agreement, state, collected, outstanding, lifecycle: rowLifecycle, collectedPercent };
  });

  const rows = lifecycle ? allRows.filter((row) => row.lifecycle === lifecycle) : allRows;
  const activeRows = rows.filter((row) => row.lifecycle !== "VOIDED");
  const totalSales = activeRows.reduce((sum, row) => sum + toNum(row.invoice.grandTotal), 0);
  const totalCollected = activeRows.reduce((sum, row) => sum + row.collected, 0);
  const totalOutstanding = activeRows.reduce((sum, row) => sum + row.outstanding, 0);

  const buildHref = (next: { category?: string; status?: string }) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    const nextCategory = next.category ?? cat ?? "";
    const nextStatus = next.status ?? lifecycle ?? "";
    if (nextCategory) sp.set("category", nextCategory);
    if (nextStatus) sp.set("status", nextStatus);
    const suffix = sp.toString();
    return `/credit-invoices${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Credit Invoices"
        subtitle="Credit-sale documents and balances. Use Credit Accounts for collections, aging, and interest."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/credit" className={buttonVariants({ variant: "outline" })}>
              <CreditCard className="h-4 w-4" /> Credit Accounts
            </Link>
            <Link href="/credit/new" className={buttonVariants()}>
              <FilePlus2 className="h-4 w-4" /> New Credit Sale
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Credit sales" value={formatLKR(totalSales)} icon={CircleDollarSign} tone="blue" />
        <StatCard label="Collected" value={formatLKR(totalCollected)} icon={CircleDollarSign} tone="green" />
        <StatCard label="Outstanding" value={formatLKR(totalOutstanding)} icon={Clock3} tone={totalOutstanding ? "amber" : "default"} />
        <StatCard label="Invoice count" value={String(activeRows.length)} icon={Files} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ListSearch
                placeholder="Search invoice, customer, phone or NIC…"
                className="relative w-full max-w-lg flex-1"
              />
              {ntEnabled && (
                <div className="flex flex-wrap gap-1" aria-label="Tax category filters">
                  {CATEGORY_FILTERS.map((filter) => (
                    <Link
                      key={filter.label}
                      href={buildHref({ category: filter.value })}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                        (cat ?? "") === filter.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-border-subtle text-muted hover:bg-border hover:text-foreground",
                      )}
                    >
                      {filter.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1" aria-label="Invoice lifecycle filters">
              {LIFECYCLE_FILTERS.map((filter) => (
                <Link
                  key={filter.label}
                  href={buildHref({ status: filter.value })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    (lifecycle ?? "") === filter.value
                      ? "bg-foreground text-surface"
                      : "text-muted hover:bg-border-subtle hover:text-foreground",
                  )}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <Files className="mx-auto h-8 w-8 text-faint" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                {query || cat || lifecycle ? "No credit invoices match these filters." : "No credit invoices yet."}
              </p>
              <p className="mt-1 text-xs text-muted">
                {query || cat || lifecycle ? "Try a different search or clear a filter." : "New credit sales will appear here automatically."}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border-subtle md:hidden">
                {rows.map((row) => {
                  const { invoice } = row;
                  return (
                    <article key={invoice.id} className={cn("p-4", row.lifecycle === "VOIDED" && "bg-danger-soft/30")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/invoices/${invoice.id}`} className="font-mono text-sm font-bold text-primary hover:underline">
                            <Highlight text={invoice.invoiceNumber} query={query} />
                          </Link>
                          <p className="mt-1 truncate text-sm font-semibold">
                            {invoice.customer?.name ? <Highlight text={invoice.customer.name} query={query} /> : "Customer unavailable"}
                          </p>
                          {invoice.customer && (
                            <p className="mt-0.5 truncate text-xs text-muted">
                              <Highlight text={invoice.customer.phone} query={query} />
                              {invoice.customer.nic && <> · <Highlight text={invoice.customer.nic} query={query} /></>}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-muted">{formatDate(invoice.createdAt)}</p>
                        </div>
                        {lifecycleBadge(row.lifecycle)}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Invoice total</p>
                          <p className={cn("tabular mt-1 font-bold", row.lifecycle === "VOIDED" && "line-through")}>
                            {formatLKR(invoice.grandTotal)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Outstanding</p>
                          <p className={cn("tabular mt-1 font-bold", row.outstanding > 0 ? "text-clay-ink" : "text-success-ink")}>
                            {formatLKR(row.outstanding)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1.5 flex justify-between text-[11px] text-muted">
                          <span>{formatLKR(row.collected)} collected</span>
                          <span>{Math.round(row.collectedPercent)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-clay-soft" role="progressbar" aria-valuenow={Math.round(row.collectedPercent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${invoice.invoiceNumber} collection progress`}>
                          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${row.collectedPercent}%` }} />
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-4 text-xs font-semibold">
                        <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">View invoice</Link>
                        {row.agreement && <Link href={`/credit/${row.agreement.id}`} className="text-muted hover:text-foreground hover:underline">View credit</Link>}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>Invoice</TH>
                      <TH>Date</TH>
                      <TH>Customer</TH>
                      <TH className="text-right">Total</TH>
                      <TH className="min-w-48">Collection progress</TH>
                      <TH className="text-right">Outstanding</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Links</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row) => {
                      const { invoice } = row;
                      return (
                        <TR key={invoice.id} className={row.lifecycle === "VOIDED" ? "bg-danger-soft/30" : undefined}>
                          <TD>
                            <Link href={`/invoices/${invoice.id}`} className="font-mono text-xs font-bold text-primary hover:underline">
                              <Highlight text={invoice.invoiceNumber} query={query} />
                            </Link>
                          </TD>
                          <TD className="whitespace-nowrap text-muted">{formatDate(invoice.createdAt)}</TD>
                          <TD>
                            <p className="font-semibold">{invoice.customer?.name ? <Highlight text={invoice.customer.name} query={query} /> : "Customer unavailable"}</p>
                            {invoice.customer && (
                              <p className="mt-0.5 text-xs text-muted">
                                <Highlight text={invoice.customer.phone} query={query} />
                                {invoice.customer.nic && <> · <Highlight text={invoice.customer.nic} query={query} /></>}
                              </p>
                            )}
                          </TD>
                          <TD className={cn("tabular whitespace-nowrap text-right font-semibold", row.lifecycle === "VOIDED" && "line-through")}>
                            {formatLKR(invoice.grandTotal)}
                          </TD>
                          <TD>
                            <div className="mb-1.5 flex justify-between text-[11px] text-muted">
                              <span className="tabular">{formatLKR(row.collected)}</span>
                              <span>{Math.round(row.collectedPercent)}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-clay-soft" role="progressbar" aria-valuenow={Math.round(row.collectedPercent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${invoice.invoiceNumber} collection progress`}>
                              <div className="h-full rounded-full bg-success" style={{ width: `${row.collectedPercent}%` }} />
                            </div>
                          </TD>
                          <TD className={cn("tabular whitespace-nowrap text-right font-bold", row.outstanding > 0 ? "text-clay-ink" : "text-success-ink")}>
                            {formatLKR(row.outstanding)}
                          </TD>
                          <TD>{lifecycleBadge(row.lifecycle)}</TD>
                          <TD>
                            <div className="flex justify-end gap-3 whitespace-nowrap text-xs font-semibold">
                              <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">Invoice</Link>
                              {row.agreement && <Link href={`/credit/${row.agreement.id}`} className="text-muted hover:text-foreground hover:underline">Credit</Link>}
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
