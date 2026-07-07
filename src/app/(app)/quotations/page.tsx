import Link from "next/link";
import { Plus, FileText, CheckCircle2, Send } from "lucide-react";
import type { Prisma, QuotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/list-search";
import { Highlight } from "@/components/highlight";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { quotationStatusLabel, quotationStatusTone } from "@/components/quotation-status-badge";
import { cn, formatLKR, formatDate } from "@/lib/utils";
import { businessStartOfMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

const STATUSES: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];

const FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  ...STATUSES.map((s) => ({ label: quotationStatusLabel[s], value: s })),
];

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const query = (q ?? "").trim();
  const stat = STATUSES.includes(status as QuotationStatus) ? (status as QuotationStatus) : undefined;

  const where: Prisma.QuotationWhereInput = {
    ...(stat ? { status: stat } : {}),
    ...(query
      ? {
          OR: [
            { quotationNumber: { contains: query, mode: "insensitive" } },
            { customerName: { contains: query, mode: "insensitive" } },
            { customer: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const monthStart = businessStartOfMonth(new Date());

  const [quotations, monthCount, acceptedAgg, sentCount] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
      take: 100,
    }),
    prisma.quotation.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.quotation.aggregate({
      where: { status: "ACCEPTED", createdAt: { gte: monthStart } },
      _sum: { grandTotal: true },
      _count: true,
    }),
    prisma.quotation.count({ where: { status: "SENT" } }),
  ]);

  const buildHref = (nextStatus: string) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (nextStatus) sp.set("status", nextStatus);
    const s = sp.toString();
    return `/quotations${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Price quotes for customers"
        action={
          <Link href="/quotations/new">
            <Button>
              <Plus className="h-4 w-4" /> New Quotation
            </Button>
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="This month" value={String(monthCount)} icon={FileText} />
        <StatCard label="Awaiting response" value={String(sentCount)} hint="Sent, not yet decided" icon={Send} tone="blue" />
        <StatCard
          label="Accepted (this month)"
          value={formatLKR(acceptedAgg._sum.grandTotal ?? 0)}
          hint={`${acceptedAgg._count} quotation${acceptedAgg._count === 1 ? "" : "s"}`}
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <ListSearch placeholder="Search quotation # or customer…" className="relative max-w-md flex-1" />
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => {
                const active = (stat ?? "") === f.value;
                return (
                  <Link
                    key={f.label}
                    href={buildHref(f.value)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-border-subtle text-muted hover:bg-border hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {quotations.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query || stat ? "No quotations match." : "No quotations yet."}
            </div>
          ) : (
            <>
              <div className="md:hidden">
                {quotations.map((qt) => {
                  const name = qt.customer?.name ?? qt.customerName ?? "—";
                  return (
                    <div key={qt.id} className="border-b border-border-subtle p-4 last:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/quotations/${qt.id}`} className="font-medium text-primary hover:underline">
                            <Highlight text={qt.quotationNumber} query={query} />
                          </Link>
                          <div className="mt-0.5 text-sm">
                            <Highlight text={name} query={query} />
                          </div>
                          <div className="mt-0.5 text-xs text-muted">{formatDate(qt.createdAt)}</div>
                        </div>
                        <span className="shrink-0 font-medium">{formatLKR(qt.grandTotal)}</span>
                      </div>
                      <div className="mt-2">
                        <Badge tone={quotationStatusTone[qt.status]}>{quotationStatusLabel[qt.status]}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>Quotation #</TH>
                      <TH>Date</TH>
                      <TH>Customer</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Total</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {quotations.map((qt) => {
                      const name = qt.customer?.name ?? qt.customerName ?? "—";
                      return (
                        <TR key={qt.id}>
                          <TD className="font-medium">
                            <Link href={`/quotations/${qt.id}`} className="text-primary hover:underline">
                              <Highlight text={qt.quotationNumber} query={query} />
                            </Link>
                          </TD>
                          <TD className="text-muted">{formatDate(qt.createdAt)}</TD>
                          <TD>
                            <Highlight text={name} query={query} />
                          </TD>
                          <TD>
                            <Badge tone={quotationStatusTone[qt.status]}>{quotationStatusLabel[qt.status]}</Badge>
                          </TD>
                          <TD className="text-right font-medium">{formatLKR(qt.grandTotal)}</TD>
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
