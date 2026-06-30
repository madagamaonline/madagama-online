import Link from "next/link";
import { Plus, Download } from "lucide-react";
import type { Prisma, TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/list-search";
import { Highlight } from "@/components/highlight";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { InvoiceCashierFilter } from "@/components/invoice-cashier-filter";
import { cn, formatLKR, formatDate } from "@/lib/utils";
import { nonTaxableEnabled, invoiceTaxableWhere } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

const statusTone = { PAID: "green", PARTIAL: "amber", CREDIT: "amber" } as const;

const FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Taxable", value: "TAXABLE" },
  { label: "Non-taxable", value: "NON_TAXABLE" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; cashier?: string }>;
}) {
  const { q, category, cashier } = await searchParams;
  const query = (q ?? "").trim();
  const ntEnabled = await nonTaxableEnabled();
  const cat = category === "TAXABLE" || category === "NON_TAXABLE" ? (category as TaxCategory) : undefined;
  const cashierId = (cashier ?? "").trim();

  const where: Prisma.InvoiceWhereInput = {
    ...(cat ? { taxCategory: cat } : {}),
    ...(cashierId ? { createdByUserId: cashierId } : {}),
    // When non-taxable is off this overrides any category filter to taxable-only.
    ...invoiceTaxableWhere(ntEnabled),
    ...(query
      ? {
          OR: [
            { invoiceNumber: { contains: query, mode: "insensitive" } },
            { customer: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [invoices, cashiers] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      take: 100,
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Build a list href that preserves the current filters, optionally overriding one.
  const buildHref = (next: { category?: string }) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    const c = next.category ?? cat ?? "";
    if (c) sp.set("category", c);
    if (cashierId) sp.set("cashier", cashierId);
    const s = sp.toString();
    return `/invoices${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="All sales"
        action={
          <div className="flex gap-2">
            <a href="/api/export/invoices" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> Export
            </a>
            <Link href="/invoices/new">
              <Button>
                <Plus className="h-4 w-4" /> New Sale
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <ListSearch placeholder="Search invoice # or customer…" className="relative max-w-md flex-1" />
            <div className="flex flex-wrap items-center gap-2">
              {ntEnabled && (
                <div className="flex gap-1">
                  {FILTERS.map((f) => {
                    const active = (cat ?? "") === f.value;
                    return (
                      <Link
                        key={f.label}
                        href={buildHref({ category: f.value })}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                          active ? "bg-primary text-primary-foreground" : "bg-border-subtle text-muted hover:bg-border hover:text-foreground",
                        )}
                      >
                        {f.label}
                      </Link>
                    );
                  })}
                </div>
              )}
              <InvoiceCashierFilter cashiers={cashiers} current={cashierId} />
            </div>
          </div>

          {invoices.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query || cat || cashierId ? "No invoices match." : "No invoices yet."}
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Invoice #</TH>
                  <TH>Date</TH>
                  <TH>Customer</TH>
                  <TH>Cashier</TH>
                  {ntEnabled && <TH>Category</TH>}
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD className="font-medium">
                      <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline">
                        <Highlight text={inv.invoiceNumber} query={query} />
                      </Link>
                    </TD>
                    <TD className="text-muted">{formatDate(inv.createdAt)}</TD>
                    <TD>{inv.customer?.name ? <Highlight text={inv.customer.name} query={query} /> : "Walk-in"}</TD>
                    <TD className="text-muted">{inv.createdBy?.name ?? "—"}</TD>
                    {ntEnabled && (
                      <TD>
                        <Badge tone={inv.taxCategory === "TAXABLE" ? "blue" : "gray"}>
                          {inv.taxCategory === "TAXABLE" ? "Taxable" : "Non-taxable"}
                        </Badge>
                      </TD>
                    )}
                    <TD>
                      <Badge tone={inv.type === "CREDIT" ? "amber" : "green"}>{inv.type}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={statusTone[inv.status]}>{inv.status}</Badge>
                    </TD>
                    <TD className="text-right font-medium">{formatLKR(inv.grandTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
