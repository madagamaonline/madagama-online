import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Phone, MapPin, CreditCard, FileText, MessageSquarePlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { computeCreditState } from "@/lib/credit";
import { formatLKR, toNum } from "@/lib/utils";
import { requestNumber, requestStatusLabel, requestStatusTone } from "@/lib/customer-requests";
import { computeOpenAccountState } from "@/lib/open-account";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      creditAgreements: {
        where: { status: { not: "VOIDED" }, invoice: { voidedAt: null } },
        orderBy: { createdAt: "desc" },
        include: { invoice: { select: { invoiceNumber: true } }, payments: true },
      },
      openAccounts: { where: { status: { not: "VOIDED" }, invoice: { voidedAt: null } }, orderBy: { openedAt: "desc" }, include: { invoice: { select: { invoiceNumber: true } }, payments: true } },
      customerRequests: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { assignedTo: { select: { name: true } } },
      },
    },
  });
  if (!customer) notFound();

  const agreements = customer.creditAgreements.map((a) => {
    const state = computeCreditState(
      {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      },
      a.payments.map((p) => ({ amount: toNum(p.amount), discount: toNum(p.discount), paidDate: p.paidDate })),
    );
    return { a, state };
  });

  const activeCount = agreements.filter(({ state }) => !state.isSettled).length;
  const totalOutstanding = agreements.reduce((s, { state }) => s + state.outstanding, 0);
  const openAccounts = customer.openAccounts.map((a) => ({ a, state: computeOpenAccountState(toNum(a.principal), a.payments.map((p) => ({ amount: toNum(p.amount), method: p.method })), a.dueDate) }));
  const openOutstanding = openAccounts.reduce((sum, row) => sum + row.state.outstanding, 0);

  const nics = [
    { key: customer.nicFrontKey, label: "NIC Front" },
    { key: customer.nicBackKey, label: "NIC Back" },
  ].filter((n) => n.key);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={customer.name}
        subtitle="Customer details"
        action={
          <div className="flex gap-2">
            <Link href={`/requests/new?customerId=${customer.id}`}>
              <Button>
                <MessageSquarePlus className="h-4 w-4" /> New Request
              </Button>
            </Link>
            <Link href={`/customers/${customer.id}/statement`}>
              <Button variant="outline">
                <FileText className="h-4 w-4" /> Statement
              </Button>
            </Link>
            <Link href={`/customers/${customer.id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
          </div>
        }
      />

      {/* Outstanding balance up top — the main thing you check a customer for
          on a phone. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Combined receivable"
          value={formatLKR(totalOutstanding + openOutstanding)}
          tone={totalOutstanding + openOutstanding > 0 ? "amber" : "default"}
        />
        <StatCard label="Pay Later balance" value={formatLKR(openOutstanding)} tone={openOutstanding ? "amber" : "default"} />
        <StatCard
          label="Active agreements"
          value={String(activeCount)}
          tone={activeCount ? "blue" : "default"}
        />
      </div>

      <Card className="mb-4"><CardHeader><CardTitle>Pay Later</CardTitle></CardHeader><CardContent className="p-0">{openAccounts.length === 0 ? <div className="px-5 py-8 text-center text-sm text-muted">No Pay Later accounts.</div> : <Table><THead><TR><TH>Invoice</TH><TH className="text-right">Original</TH><TH className="text-right">Outstanding</TH><TH>Status</TH></TR></THead><TBody>{openAccounts.map(({ a, state }) => <TR key={a.id}><TD><Link href={`/open-accounts/${a.id}`} className="font-mono text-primary hover:underline">{a.invoice.invoiceNumber}</Link></TD><TD className="text-right">{formatLKR(state.principal)}</TD><TD className="text-right font-medium">{formatLKR(state.outstanding)}</TD><TD><Badge tone={state.isSettled ? "green" : state.isOverdue ? "red" : "amber"}>{state.isSettled ? "Paid" : state.isOverdue ? "Overdue" : state.credited ? "Partial" : "Unpaid"}</Badge></TD></TR>)}</TBody></Table>}</CardContent></Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted" /> {customer.phone}
            </p>
            {customer.nic && <p className="text-muted">NIC: {customer.nic}</p>}
            {customer.email && <p className="text-muted">{customer.email}</p>}
            {customer.address && (
              <p className="flex items-start gap-2 text-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {customer.address}
              </p>
            )}
            {nics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {nics.map((n) => (
                  <a
                    key={n.key}
                    href={`/api/files/${n.key}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${n.key}`} alt={n.label} className="h-24 w-full object-cover" />
                    <span className="block bg-input px-2 py-1 text-center text-xs text-muted">{n.label}</span>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Credit Agreements</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {agreements.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">
                <CreditCard className="mx-auto mb-2 h-7 w-7 opacity-40" />
                No credit agreements.
              </div>
            ) : (
              <>
                <div className="md:hidden">
                  {agreements.map(({ a, state }) => (
                    <Link
                      key={a.id}
                      href={`/credit/${a.id}`}
                      className="block border-b border-border-subtle p-4 last:border-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-medium text-primary">{a.invoice.invoiceNumber}</span>
                          <div className="mt-0.5 text-xs text-muted">
                            Principal {formatLKR(state.principal)}
                          </div>
                        </div>
                        {state.isSettled ? (
                          <Badge tone="green">Settled</Badge>
                        ) : state.isOverdue ? (
                          <Badge tone="red">Overdue</Badge>
                        ) : (
                          <Badge tone="amber">In grace</Badge>
                        )}
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {formatLKR(state.outstanding)} outstanding
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Invoice</TH>
                        <TH className="text-right">Principal</TH>
                        <TH className="text-right">Outstanding</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {agreements.map(({ a, state }) => (
                        <TR key={a.id}>
                          <TD className="font-medium">
                            <Link href={`/credit/${a.id}`} className="text-primary hover:underline">
                              {a.invoice.invoiceNumber}
                            </Link>
                          </TD>
                          <TD className="text-right">{formatLKR(state.principal)}</TD>
                          <TD className="text-right font-medium">{formatLKR(state.outstanding)}</TD>
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
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Product requests and inquiries</CardTitle>
          <Link href={`/requests/new?customerId=${customer.id}`} className="text-xs font-medium text-primary hover:underline">+ Add request</Link>
        </CardHeader>
        <CardContent className="p-0">
          {customer.customerRequests.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">No requests recorded for this customer.</div>
          ) : (
            <div className="divide-y divide-border">
              {customer.customerRequests.map((request) => (
                <Link key={request.id} href={`/requests/${request.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-border-subtle/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{request.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{requestNumber(request.requestNumber)} · Qty {request.quantity} · {request.assignedTo.name}</p>
                  </div>
                  <Badge tone={requestStatusTone(request.status)}>{requestStatusLabel(request.status)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
