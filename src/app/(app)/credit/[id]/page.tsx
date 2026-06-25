import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ReceiptText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { RecordPayment } from "@/components/record-payment";
import { SendReminderButton } from "@/components/send-reminder-button";
import { computeCreditState } from "@/lib/credit";
import { formatLKR, formatDate, formatDateTime, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-border pt-2 text-base font-semibold" : "text-sm"}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default async function CreditDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const a = await prisma.creditAgreement.findUnique({
    where: { id },
    include: {
      customer: true,
      guarantor: true,
      invoice: { select: { id: true, invoiceNumber: true } },
      payments: { orderBy: { paidDate: "desc" } },
    },
  });
  if (!a) notFound();

  const state = computeCreditState(
    {
      principal: toNum(a.principal),
      startDate: a.startDate,
      interestRatePerMonth: toNum(a.interestRatePerMonth),
      interestFreeMonths: a.interestFreeMonths,
    },
    a.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate })),
  );

  const ratePct = Math.round(toNum(a.interestRatePerMonth) * 100);
  const guarantorNics = [
    { key: a.guarantor.nicFrontKey, label: "Front" },
    { key: a.guarantor.nicBackKey, label: "Back" },
  ].filter((n) => n.key);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Credit — ${a.customer.name}`}
        subtitle={`Invoice ${a.invoice.invoiceNumber} · started ${formatDate(a.startDate)}`}
        action={
          <Link href={`/invoices/${a.invoice.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <ReceiptText className="h-4 w-4" /> View invoice
          </Link>
        }
      />

      {isNew && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5" /> Credit sale created.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Balance */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Balance</CardTitle>
            {state.isSettled ? (
              <Badge tone="green">Settled</Badge>
            ) : state.isOverdue ? (
              <Badge tone="red">Overdue</Badge>
            ) : (
              <Badge tone="amber">In grace</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Original principal" value={formatLKR(state.principal)} />
            <Row label="Principal remaining" value={formatLKR(state.principalRemaining)} />
            <Row label={`Interest charged (${ratePct}%/mo)`} value={formatLKR(state.interestAccrued)} />
            <Row label="Interest unpaid" value={formatLKR(state.interestOutstanding)} />
            <Row label="Total paid" value={formatLKR(state.totalPaid)} />
            <Row label="Outstanding" value={formatLKR(state.outstanding)} strong />
            <div className="grid grid-cols-2 gap-2 pt-3 text-xs text-muted">
              <span>Interest-free until: <b className="text-foreground">{formatDate(state.graceEndDate)}</b></span>
              {!state.isSettled && state.nextChargeDate && (
                <span>Next interest on: <b className="text-foreground">{formatDate(state.nextChargeDate)}</b></span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Record payment */}
        <Card>
          <CardHeader>
            <CardTitle>Record Payment</CardTitle>
          </CardHeader>
          <CardContent>
            {state.isSettled ? (
              <p className="text-sm text-muted">This agreement is fully settled.</p>
            ) : (
              <div className="space-y-4">
                <RecordPayment agreementId={a.id} />
                <div className="border-t border-border pt-4">
                  <SendReminderButton agreementId={a.id} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Guarantor */}
        <Card>
          <CardHeader>
            <CardTitle>Guarantor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{a.guarantor.name}</p>
            <p className="text-muted">NIC: {a.guarantor.nic}</p>
            <p className="text-muted">{a.guarantor.phone}</p>
            {a.guarantor.address && <p className="text-muted">{a.guarantor.address}</p>}
            {guarantorNics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {guarantorNics.map((n) => (
                  <a key={n.key} href={`/api/files/${n.key}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${n.key}`} alt={`NIC ${n.label}`} className="h-20 w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment history */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {a.payments.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted">No payments yet.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Method</TH>
                    <TH>Note</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {a.payments.map((p) => (
                    <TR key={p.id}>
                      <TD>{formatDateTime(p.paidDate)}</TD>
                      <TD>{p.method}</TD>
                      <TD className="text-muted">{p.note ?? "—"}</TD>
                      <TD className="text-right font-medium">{formatLKR(p.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
