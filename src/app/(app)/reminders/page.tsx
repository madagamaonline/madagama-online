import Link from "next/link";
import { Plus } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SendReminderButton } from "@/components/send-reminder-button";
import { computeCreditState } from "@/lib/credit";
import { formatLKR, formatDate, toNum, dueLabel } from "@/lib/utils";
import { ACTIVE_REQUEST_STATUSES, requestNumber, requestStatusLabel, requestStatusTone } from "@/lib/customer-requests";
import { businessStartOfDay } from "@/lib/dates";

export const dynamic = "force-dynamic";

type Urgency = "overdue" | "soon" | "later";

function urgencyOf(days: number, isOverdue: boolean): Urgency {
  if (isOverdue || days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "later";
}

function badgeTone(u: Urgency): "red" | "amber" | "gray" {
  return u === "overdue" ? "red" : u === "soon" ? "amber" : "gray";
}

export default async function RemindersPage() {
  const now = new Date();

  const [agreements, purchases, customerRequests] = await Promise.all([
    prisma.creditAgreement.findMany({
      where: { status: "ACTIVE", invoice: { voidedAt: null } },
      include: {
        customer: { select: { name: true, phone: true } },
        invoice: { select: { invoiceNumber: true } },
        payments: true,
      },
      take: 500,
    }),
    prisma.purchase.findMany({
      where: { status: { in: ["CREDIT", "PARTIAL"] }, creditDueDate: { not: null } },
      include: { supplier: { select: { id: true, name: true } } },
      take: 500,
    }),
    prisma.customerRequest.findMany({
      where: { status: { in: ACTIVE_REQUEST_STATUSES }, followUpAt: { not: null } },
      include: {
        customer: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ followUpAt: "asc" }, { priority: "desc" }],
      take: 100,
    }),
  ]);

  const requestRows = customerRequests
    .map((request) => ({
      ...request,
      days: Math.round((request.followUpAt!.getTime() - businessStartOfDay(now).getTime()) / 86_400_000),
    }))
    .filter((request) => request.days <= 7);

  // ---- Receivables (customers owe you) ----
  type CustRow = {
    id: string;
    name: string;
    invoiceNumber: string;
    outstanding: number;
    days: number;
    urgency: Urgency;
  };
  const custRows: CustRow[] = [];
  for (const a of agreements) {
    const state = computeCreditState(
      {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      },
      a.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate })),
    );
    if (state.outstanding <= 0) continue;
    const days = differenceInCalendarDays(state.graceEndDate, now);
    custRows.push({
      id: a.id,
      name: a.customer.name,
      invoiceNumber: a.invoice.invoiceNumber,
      outstanding: state.outstanding,
      days,
      urgency: urgencyOf(days, state.isOverdue),
    });
  }
  custRows.sort((x, y) => x.days - y.days);
  const custByUrgency = {
    overdue: custRows.filter((r) => r.urgency === "overdue"),
    soon: custRows.filter((r) => r.urgency === "soon"),
    later: custRows.filter((r) => r.urgency === "later"),
  };

  // ---- Payables (you owe suppliers), grouped by supplier ----
  type SupRow = { purchaseId: string; ref: string; balance: number; days: number; urgency: Urgency };
  type SupGroup = {
    supplierId: string;
    supplierName: string;
    rows: SupRow[];
    total: number;
    worstDays: number;
  };
  const groups = new Map<string, SupGroup>();
  for (const p of purchases) {
    const balance = toNum(p.total) - toNum(p.amountPaid);
    if (balance <= 0 || !p.creditDueDate) continue;
    const days = differenceInCalendarDays(p.creditDueDate, now);
    const row: SupRow = {
      purchaseId: p.id,
      ref: p.supplierInvoiceNo?.trim() || formatDate(p.date),
      balance,
      days,
      urgency: urgencyOf(days, false),
    };
    const g =
      groups.get(p.supplierId) ??
      { supplierId: p.supplierId, supplierName: p.supplier.name, rows: [], total: 0, worstDays: Infinity };
    g.rows.push(row);
    g.total += balance;
    g.worstDays = Math.min(g.worstDays, days);
    groups.set(p.supplierId, g);
  }
  const supGroups = [...groups.values()];
  for (const g of supGroups) g.rows.sort((a, b) => a.days - b.days);
  supGroups.sort((a, b) => a.worstDays - b.worstDays);

  // ---- Stat cards ----
  const sum = (rows: { outstanding?: number; balance?: number }[], key: "outstanding" | "balance") =>
    rows.reduce((s, r) => s + (r[key] ?? 0), 0);
  const recvOverdue = sum(custByUrgency.overdue, "outstanding");
  const recvSoon = sum(custByUrgency.soon, "outstanding");
  const allSupRows = supGroups.flatMap((g) => g.rows);
  const payOverdue = allSupRows.filter((r) => r.urgency === "overdue").reduce((s, r) => s + r.balance, 0);
  const paySoon = allSupRows.filter((r) => r.urgency === "soon").reduce((s, r) => s + r.balance, 0);

  return (
    <div>
      <PageHeader
        title="Reminders"
        subtitle="Customer follow-ups, money to collect, and bills to pay"
        action={<Link href="/requests/new"><Button><Plus className="h-4 w-4" /> New request</Button></Link>}
      />

      <Card className="mb-4">
        <CardHeader className="flex items-center justify-between gap-3">
          <CardTitle>Customer requests to follow up</CardTitle>
          <Link href="/requests" className="text-xs font-medium text-primary hover:underline">View all requests</Link>
        </CardHeader>
        <CardContent className="p-0">
          {requestRows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">No customer-request reminders due in the next 7 days.</div>
          ) : (
            <div className="divide-y divide-border">
              {requestRows.map((request) => (
                <Link key={request.id} href={`/requests/${request.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-border-subtle/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{request.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{requestNumber(request.requestNumber)} · {request.customer?.name ?? request.contactName ?? request.contactPhone ?? "Walk-in"} · {request.assignedTo.name}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Badge tone={request.days < 0 ? "red" : "amber"}>{dueLabel(request.days)}</Badge>
                    <Badge tone={requestStatusTone(request.status)}>{requestStatusLabel(request.status)}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Collect — overdue" value={formatLKR(recvOverdue)} tone={recvOverdue ? "red" : "default"} />
        <StatCard label="Collect — due ≤7d" value={formatLKR(recvSoon)} tone={recvSoon ? "amber" : "default"} />
        <StatCard label="Pay — overdue" value={formatLKR(payOverdue)} tone={payOverdue ? "red" : "default"} />
        <StatCard label="Pay — due ≤7d" value={formatLKR(paySoon)} tone={paySoon ? "amber" : "default"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Customers owe you */}
        <Card>
          <CardHeader>
            <CardTitle>Customers owe you</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {custRows.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">Nothing outstanding. 🎉</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH className="text-right">Outstanding</TH>
                    <TH>Status</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {(["overdue", "soon"] as const).map((bucket) =>
                    custByUrgency[bucket].length === 0 ? null : (
                      <CustomerBucket key={bucket} rows={custByUrgency[bucket]} />
                    ),
                  )}
                  {custByUrgency.later.length > 0 && (
                    <TR>
                      <TD colSpan={4} className="bg-bg/50 text-xs text-muted">
                        + {custByUrgency.later.length} more not yet due ·{" "}
                        <span className="tabular">{formatLKR(sum(custByUrgency.later, "outstanding"))}</span>{" "}
                        outstanding —{" "}
                        <Link href="/credit" className="text-primary hover:underline">
                          view all credit
                        </Link>
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* You owe suppliers */}
        <Card>
          <CardHeader>
            <CardTitle>You owe suppliers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {supGroups.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">No supplier credit due. 🎉</div>
            ) : (
              <div className="divide-y divide-border">
                {supGroups.map((g) => (
                  <div key={g.supplierId} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Link href={`/suppliers/${g.supplierId}`} className="font-medium hover:underline">
                        {g.supplierName}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge tone={badgeTone(urgencyOf(g.worstDays, false))}>{dueLabel(g.worstDays)}</Badge>
                        <span className="tabular text-sm font-semibold">{formatLKR(g.total)}</span>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {g.rows.map((r) => (
                        <li key={r.purchaseId} className="flex items-center justify-between gap-3 text-sm">
                          <Link href={`/purchases/${r.purchaseId}`} className="text-muted hover:text-foreground hover:underline">
                            {r.ref}
                          </Link>
                          <span className="flex items-center gap-2">
                            <span className="text-[11px] text-muted">{dueLabel(r.days)}</span>
                            <span className="tabular">{formatLKR(r.balance)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CustomerBucket({
  rows,
}: {
  rows: { id: string; name: string; invoiceNumber: string; outstanding: number; days: number; urgency: Urgency }[];
}) {
  return (
    <>
      {rows.map((r) => (
        <TR key={r.id}>
          <TD>
            <Link href={`/credit/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </Link>
            <span className="ml-2 font-mono text-[11px] text-muted">{r.invoiceNumber}</span>
          </TD>
          <TD className="text-right font-medium tabular">{formatLKR(r.outstanding)}</TD>
          <TD>
            <Badge tone={badgeTone(r.urgency)}>{dueLabel(r.days)}</Badge>
          </TD>
          <TD className="text-right">
            <SendReminderButton agreementId={r.id} compact />
          </TD>
        </TR>
      ))}
    </>
  );
}
