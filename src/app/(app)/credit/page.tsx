import Link from "next/link";
import { Plus } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { computeCreditState } from "@/lib/credit";
import { formatLKR, formatDate, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CreditPage() {
  const agreements = await prisma.creditAgreement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true, phone: true } },
      invoice: { select: { invoiceNumber: true } },
      payments: true,
    },
    take: 300,
  });

  const rows = agreements.map((a) => {
    const state = computeCreditState(
      {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      },
      a.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate })),
    );
    return { a, state };
  });

  const totalOutstanding = rows.reduce((s, r) => s + r.state.outstanding, 0);
  const overdueCount = rows.filter((r) => r.state.isOverdue && !r.state.isSettled).length;
  const activeCount = rows.filter((r) => !r.state.isSettled).length;

  // Aging: bucket each unsettled balance by how far past the grace period it is.
  const now = new Date();
  const aging = [
    { label: "In grace", total: 0, count: 0 },
    { label: "1–30 days", total: 0, count: 0 },
    { label: "31–60 days", total: 0, count: 0 },
    { label: "61–90 days", total: 0, count: 0 },
    { label: "90+ days", total: 0, count: 0 },
  ];
  const daysOverdueOf = (graceEndDate: Date) => Math.max(0, differenceInCalendarDays(now, graceEndDate));
  for (const r of rows) {
    if (r.state.isSettled) continue;
    let i = 0;
    if (r.state.isOverdue) {
      const days = daysOverdueOf(r.state.graceEndDate);
      i = days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    }
    aging[i].total += r.state.outstanding;
    aging[i].count += 1;
  }

  return (
    <div>
      <PageHeader
        title="Credit"
        subtitle="Customer credit agreements"
        action={
          <Link href="/credit/new">
            <Button>
              <Plus className="h-4 w-4" /> New Credit Sale
            </Button>
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Outstanding" value={formatLKR(totalOutstanding)} tone="amber" />
        <StatCard label="Active Agreements" value={String(activeCount)} tone="blue" />
        <StatCard label="Overdue" value={String(overdueCount)} tone={overdueCount ? "red" : "default"} />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Aging of outstanding balances</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {aging.map((b) => (
            <div key={b.label} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted">{b.label}</p>
              <p className="text-lg font-semibold">{formatLKR(b.total)}</p>
              <p className="text-xs text-muted">{b.count} agreement(s)</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">No credit agreements yet.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Customer</TH>
                  <TH className="text-right">Principal</TH>
                  <TH className="text-right">Outstanding</TH>
                  <TH>Grace ends</TH>
                  <TH className="text-right">Overdue</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map(({ a, state }) => (
                  <TR key={a.id}>
                    <TD className="font-medium">
                      <Link href={`/credit/${a.id}`} className="text-primary hover:underline">
                        {a.invoice.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>{a.customer.name}</TD>
                    <TD className="text-right">{formatLKR(state.principal)}</TD>
                    <TD className="text-right font-medium">{formatLKR(state.outstanding)}</TD>
                    <TD className="text-muted">{formatDate(state.graceEndDate)}</TD>
                    <TD className="text-right text-muted">
                      {!state.isSettled && state.isOverdue ? `${daysOverdueOf(state.graceEndDate)}d` : "—"}
                    </TD>
                    <TD>
                      {state.isSettled ? (
                        <Badge tone="green">Settled</Badge>
                      ) : state.isOverdue ? (
                        <Badge tone="red">Overdue</Badge>
                      ) : (
                        <Badge tone="amber">In grace</Badge>
                      )}
                    </TD>
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
