import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, Landmark, OctagonX, ReceiptText, RefreshCw, Truck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { chequeBalance, chequeState, chequeStateLabel, chequeStateTone, isVoidState, voidKindLabel } from "@/lib/cheques";
import { formatDate, formatDateTime, formatLKR, toNum } from "@/lib/utils";
import { ChequeLifecyclePanel } from "@/components/cheque-lifecycle-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ChequeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cheque = await prisma.issuedCheque.findUnique({
    where: { id },
    include: {
      supplier: true,
      bankAccount: true,
      purchase: { select: { id: true, supplierInvoiceNo: true, date: true } },
      payments: { orderBy: [{ paidDate: "asc" }, { createdAt: "asc" }] },
      voidedBy: { select: { name: true } },
      replaces: { select: { id: true, chequeNumber: true, amount: true, voidKind: true } },
      replacedBy: { select: { id: true, chequeNumber: true, amount: true, dueDate: true } },
    },
  });
  if (!cheque) notFound();

  const original = toNum(cheque.amount);
  const paid = cheque.payments.reduce((sum, payment) => sum + toNum(payment.amount), 0);
  const remaining = chequeBalance(original, cheque.payments.map((payment) => toNum(payment.amount)));
  const status = chequeState(cheque, remaining);
  const voided = isVoidState(status);
  const paidPct = original > 0 ? Math.min(100, (paid / original) * 100) : 0;
  const ledger = cheque.payments.reduce<Array<(typeof cheque.payments)[number] & { balanceAfter: number }>>(
    (rows, payment) => {
      const priorBalance = rows.at(-1)?.balanceAfter ?? original;
      return [...rows, { ...payment, balanceAfter: Math.max(0, priorBalance - toNum(payment.amount)) }];
    },
    [],
  );

  return <div className="mx-auto max-w-5xl">
    <PageHeader title={`Cheque #${cheque.chequeNumber}`} subtitle={`${cheque.supplier.name} · ${cheque.bankAccount.bankName}`} action={<Badge tone={chequeStateTone[status]} className="px-3 py-1">{chequeStateLabel[status]}</Badge>} />

    {voided && cheque.voidKind && (
      <Card className="mb-4 border-danger/40 bg-danger-soft/40">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <OctagonX className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div>
              <p className="font-bold text-danger-ink">{voidKindLabel[cheque.voidKind]} on {formatDate(cheque.voidedAt!)}</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-danger-ink/90">{cheque.voidReason}</p>
              <p className="mt-2 text-xs text-danger-ink/80">
                {toNum(cheque.reversedAmount ?? 0) > 0
                  ? `${formatLKR(cheque.reversedAmount!)} was put back onto the supplier's balance — the debt is still owed.`
                  : "No linked purchase, so no supplier balance was restored."}
                {cheque.voidedBy ? ` · Recorded by ${cheque.voidedBy.name}` : ""}
              </p>
            </div>
          </div>
          {cheque.replacedBy ? (
            <Link href={`/banking/cheques/${cheque.replacedBy.id}`} className="shrink-0">
              <Button variant="outline" size="sm"><RefreshCw className="h-4 w-4" /> Replaced by #{cheque.replacedBy.chequeNumber}</Button>
            </Link>
          ) : (
            <Link href={`/banking/cheques/new?replaces=${cheque.id}`} className="shrink-0">
              <Button size="sm"><RefreshCw className="h-4 w-4" /> Issue replacement</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    )}

    {cheque.replaces && (
      <div className="mb-4 rounded-xl border border-border bg-input px-4 py-3 text-sm">
        <RefreshCw className="mr-2 inline h-4 w-4 text-clay" />
        Replaces{" "}
        <Link href={`/banking/cheques/${cheque.replaces.id}`} className="font-mono font-semibold text-primary hover:underline">
          #{cheque.replaces.chequeNumber}
        </Link>{" "}
        ({formatLKR(cheque.replaces.amount)}), which was {cheque.replaces.voidKind?.toLowerCase()}.
      </div>
    )}

    <Card className="overflow-hidden border-primary/30">
      <div className="grid lg:grid-cols-[1.35fr_.65fr]">
        <CardContent className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div><p className="text-xs font-bold uppercase tracking-wider text-muted">Issued cheque</p><p className="mt-1 font-mono text-2xl font-black tracking-tight text-primary sm:text-3xl">#{cheque.chequeNumber}</p><Link href={`/suppliers/${cheque.supplierId}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold hover:text-primary"><Truck className="h-4 w-4" /> {cheque.supplier.name}</Link></div>
            <div className="text-left sm:text-right"><p className="text-xs text-muted">{voided ? "Voided — no bank liability" : "Remaining liability"}</p><p className={`mt-1 text-3xl font-black tabular-nums tracking-tight sm:text-4xl ${status === "OVERDUE" ? "text-danger" : voided ? "text-muted line-through" : ""}`}>{formatLKR(remaining)}</p><p className="mt-1 text-xs text-muted">of {formatLKR(original)} original</p></div>
          </div>
          <div className="mt-7"><div className="mb-2 flex justify-between text-xs"><span className="font-semibold text-primary-ink">{Math.round(paidPct)}% repaid</span><span className="tabular-nums text-muted">{formatLKR(paid)} paid</span></div><div className="h-3 overflow-hidden rounded-full bg-border-subtle"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${paidPct}%` }} /></div></div>
        </CardContent>
        <div className="border-t border-border-subtle bg-border-subtle/35 p-6 lg:border-l lg:border-t-0">
          <dl className="space-y-4 text-sm">
            <div><dt className="flex items-center gap-1.5 text-xs text-muted"><Landmark className="h-3.5 w-3.5" /> Bank account</dt><dd className="mt-1 font-semibold">{cheque.bankAccount.bankName}</dd><dd className="font-mono text-xs text-muted">{cheque.bankAccount.accountName} · {cheque.bankAccount.accountNumber}</dd></div>
            <div className="grid grid-cols-2 gap-3"><div><dt className="flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="h-3.5 w-3.5" /> Issued</dt><dd className="mt-1 font-medium">{formatDate(cheque.issuedDate)}</dd></div><div><dt className="text-xs text-muted">Due</dt><dd className={`mt-1 font-semibold ${status === "OVERDUE" ? "text-danger" : ""}`}>{formatDate(cheque.dueDate)}</dd></div></div>
            {cheque.purchase && <Link href={`/purchases/${cheque.purchase.id}`} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-input"><span><span className="flex items-center gap-1.5 text-xs text-muted"><ReceiptText className="h-3.5 w-3.5" /> Linked purchase</span><span className="mt-1 block font-semibold">{cheque.purchase.supplierInvoiceNo || formatDate(cheque.purchase.date)}</span></span><ArrowRight className="h-4 w-4 text-primary" /></Link>}
            {cheque.notes && <div><dt className="text-xs text-muted">Notes</dt><dd className="mt-1 whitespace-pre-wrap">{cheque.notes}</dd></div>}
          </dl>
        </div>
      </div>
    </Card>

    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader><CardTitle>Bank ledger</CardTitle></CardHeader>
        {ledger.length === 0 ? <CardContent className="py-10 text-center"><p className="font-semibold">{voided ? "Nothing ever left the bank" : "Not yet presented"}</p><p className="mt-1 text-sm text-muted">{voided ? "This cheque was voided before the bank debited the account." : "The full cheque amount is still outstanding."}</p></CardContent> : <CardContent className="p-0"><Table><THead><TR><TH>Date</TH><TH>Note</TH><TH className="text-right">Debited</TH><TH className="text-right">Balance after</TH></TR></THead><TBody>{ledger.map((payment) => <TR key={payment.id}><TD>{formatDateTime(payment.paidDate)}</TD><TD className="text-muted">{payment.note || "—"}</TD><TD className="text-right font-medium tabular-nums text-primary-ink">− {formatLKR(payment.amount)}</TD><TD className="text-right font-bold tabular-nums">{formatLKR(payment.balanceAfter)}</TD></TR>)}</TBody></Table></CardContent>}
      </Card>
      <Card className="h-fit">
        <CardHeader><CardTitle>{voided ? "Cheque voided" : remaining > 0 ? "Cheque status" : "Cheque cleared"}</CardTitle></CardHeader>
        <CardContent>
          {voided
            ? <div className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">This cheque is frozen. Issue a replacement cheque, or record a cash payment on the linked purchase to settle the supplier.</div>
            : remaining > 0
              ? <ChequeLifecyclePanel chequeId={cheque.id} remaining={remaining} />
              : <div className="rounded-xl bg-primary-soft p-4 text-center text-sm font-medium text-primary-ink">The bank has honoured this cheque in full{cheque.clearedDate ? ` on ${formatDate(cheque.clearedDate)}` : ""}.</div>}
        </CardContent>
      </Card>
    </div>
  </div>;
}
