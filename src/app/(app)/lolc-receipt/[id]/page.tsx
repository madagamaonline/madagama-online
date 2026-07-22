import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Phone, Printer, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ConfirmLolcForm,
  MarkMcashSentForm,
  ReportIssueForm,
  VoidLolcForm,
} from "@/components/lolc-receipt-actions";
import { LolcWorkflowRail, lolcNextAction } from "@/components/lolc-workflow-rail";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { lolcReceiptNumber, lolcStatusLabel, lolcStatusTone } from "@/lib/lolc-receipts";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatLKR } from "@/lib/utils";
import { confirmLolcReceipt, markLolcReceiptSent, reportLolcReceiptIssue, voidLolcReceipt } from "../actions";

export const dynamic = "force-dynamic";

const eventLabels = {
  CREATED: "Receipt issued",
  MCASH_SENT: "Sent through mCash",
  ISSUE_REPORTED: "Issue reported",
  LOLC_CONFIRMED: "LOLC payment confirmed",
  VOIDED: "Receipt voided",
} as const;

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className={`mt-1 break-words font-medium ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd></div>;
}

export default async function LolcReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const receipt = await prisma.lolcReceipt.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      remittedBy: { select: { name: true } },
      confirmedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      events: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], include: { actor: { select: { name: true } } } },
    },
  });
  if (!receipt) notFound();
  const staffFinance = user.role === "ADMIN" || user.role === "STAFF";
  const number = lolcReceiptNumber(receipt.receiptNumber);
  const open = receipt.status !== "LOLC_CONFIRMED" && receipt.status !== "VOIDED";
  const attention = receipt.status === "NEEDS_ATTENTION";

  return <div className="mx-auto max-w-6xl">
    <PageHeader title="LOLC receipt" subtitle="Operational tracking only — excluded from business accounts and shift cash." action={<div className="flex gap-2"><Link href="/lolc-receipt"><Button variant="outline">Register</Button></Link><Link href={`/lolc-receipt/${id}/print`}><Button><Printer className="h-4 w-4" />Print / reprint</Button></Link></div>} />

    <section className={`mb-5 overflow-hidden rounded-2xl border bg-surface shadow-sm ${attention ? "border-danger/35" : "border-primary/20"}`}>
      <div className="grid gap-5 p-5 sm:grid-cols-[1.35fr_1fr_auto] sm:items-end lg:p-6">
        <div><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">{number}</p><Badge tone={lolcStatusTone(receipt.status)}>{lolcStatusLabel(receipt.status)}</Badge></div><h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{receipt.customerName}</h1><p className="mt-1 text-sm text-muted">{receipt.customerPhone} · LOLC code <span className="font-mono text-xs">{receipt.lolcCode}</span></p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Collected amount</p><p className="mt-1 text-2xl font-extrabold tabular text-foreground sm:text-3xl">{formatLKR(receipt.amount)}</p><p className="mt-1 text-xs text-muted">{formatDate(receipt.collectedAt)}</p></div>
        <div className="hidden h-16 w-px bg-border sm:block" />
      </div>
      <div className={`border-t px-5 py-4 lg:px-6 ${attention ? "border-danger/20 bg-danger-soft/40" : "border-border bg-input/45"}`}>
        <LolcWorkflowRail status={receipt.status} collectedAt={receipt.collectedAt} mCashSent={Boolean(receipt.remittedAt)} lolcConfirmed={Boolean(receipt.confirmedAt)} />
      </div>
    </section>

    {receipt.status === "VOIDED" && <div className="mb-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-ink"><strong>VOID — this receipt is not valid.</strong><span className="ml-2">{receipt.voidReason}</span></div>}

    {open && <section className={`mb-5 grid gap-5 rounded-2xl border-l-4 bg-surface p-5 shadow-sm md:grid-cols-[minmax(220px,.75fr)_minmax(0,1.25fr)] ${attention ? "border-y-danger/25 border-r-danger/25 border-l-danger" : "border-y-primary/20 border-r-primary/20 border-l-primary"}`}>
      <header>
        <span className={`inline-flex rounded-xl p-2.5 ${attention ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"}`}>{attention ? <AlertTriangle className="h-5 w-5" /> : <Send className="h-5 w-5" />}</span>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Next action</p>
        <h2 className="mt-1 text-lg font-bold text-foreground">{lolcNextAction(receipt.status)}</h2>
        <p className="mt-1 text-sm leading-5 text-muted">{receipt.status === "COLLECTED" ? "Record the matching mCash transaction before this collection leaves the waiting queue." : receipt.status === "MCASH_SENT" ? "Check that LOLC applied the amount, then record the confirmation or flag a delay." : "Resolve the recorded issue, verify the agreement, and preserve the result here."}</p>
        {attention && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger-ink">{receipt.issueNote}</p>}
      </header>
      <div className="rounded-xl border border-border bg-background p-4">
        {staffFinance && receipt.status === "COLLECTED" && <MarkMcashSentForm action={markLolcReceiptSent.bind(null, id)} idempotencyKey={crypto.randomUUID()} />}
        {staffFinance && receipt.status === "MCASH_SENT" && <div className="space-y-5"><ConfirmLolcForm action={confirmLolcReceipt.bind(null, id)} idempotencyKey={crypto.randomUUID()} /><details className="border-t border-border pt-4"><summary className="cursor-pointer text-xs font-semibold text-danger">Payment not showing? Report an issue</summary><div className="mt-4"><ReportIssueForm action={reportLolcReceiptIssue.bind(null, id)} idempotencyKey={crypto.randomUUID()} /></div></details></div>}
        {staffFinance && receipt.status === "NEEDS_ATTENTION" && <ConfirmLolcForm action={confirmLolcReceipt.bind(null, id)} idempotencyKey={crypto.randomUUID()} />}
        {!staffFinance && <p className="text-sm text-muted">An admin or staff cashier must complete this checkpoint.</p>}
      </div>
    </section>}

    {receipt.status === "LOLC_CONFIRMED" && <div className="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-success-soft px-4 py-3 text-sm text-success-ink"><CheckCircle2 className="h-5 w-5" /><div><strong>Journey complete.</strong><span className="ml-1">LOLC confirmation was recorded {formatDateTime(receipt.confirmedAt)}.</span></div></div>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
      <Card><CardHeader><CardTitle>Issued receipt</CardTitle></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
        <Field label="Customer" value={receipt.customerName} />
        <Field label="Phone" value={<a href={`tel:${receipt.customerPhone}`} className="text-primary hover:underline"><Phone className="mr-1 inline h-3.5 w-3.5" />{receipt.customerPhone}</a>} />
        <Field label="LOLC agreement / payment code" value={receipt.lolcCode} mono />
        <Field label="Collection date" value={formatDate(receipt.collectedAt)} />
        <Field label="Amount collected" value={<span className="text-base font-bold tabular">{formatLKR(receipt.amount)}</span>} />
        <Field label="Issued by" value={receipt.createdBy?.name ?? "Former user"} />
      </dl>{receipt.note && <div className="mt-5 border-t border-border pt-4"><p className="text-xs text-muted">Original note</p><p className="mt-1 whitespace-pre-wrap text-sm">{receipt.note}</p></div>}</CardContent></Card>

      <aside className="space-y-5">
        <Card><CardHeader><CardTitle>Checkpoint evidence</CardTitle></CardHeader><CardContent><dl className="space-y-4 text-sm"><Field label="mCash reference" value={receipt.mCashReference} mono /><Field label="Sent at" value={formatDateTime(receipt.remittedAt)} /><Field label="Sent by" value={receipt.remittedBy?.name} /><div className="border-t border-border pt-4"><Field label="LOLC confirmation reference" value={receipt.lolcConfirmationReference} mono /></div><Field label="Confirmed at" value={formatDateTime(receipt.confirmedAt)} /><Field label="Confirmed by" value={receipt.confirmedBy?.name} /></dl></CardContent></Card>
        {user.role === "ADMIN" && receipt.status !== "VOIDED" && <details className="rounded-xl border border-danger/20 bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-danger">Void issued receipt</summary><div className="mt-4"><VoidLolcForm action={voidLolcReceipt.bind(null, id)} confirmed={receipt.status === "LOLC_CONFIRMED"} idempotencyKey={crypto.randomUUID()} /></div></details>}
      </aside>
    </div>

    <Card className="mt-5"><CardHeader><CardTitle>Activity history</CardTitle></CardHeader><CardContent><ol className="space-y-5">{receipt.events.map((event) => <li key={event.id} className="relative border-l-2 border-border pl-5 text-sm"><span className={`absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-full ${event.type === "ISSUE_REPORTED" || event.type === "VOIDED" ? "bg-danger" : "bg-primary"}`} /><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold">{eventLabels[event.type]}</span><span className="text-xs text-muted">{formatDateTime(event.occurredAt)}</span></div><p className="mt-0.5 text-xs text-muted">{event.actor?.name ?? "Former user"}{event.reference ? ` · Ref ${event.reference}` : ""}</p>{event.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-input px-3 py-2 text-muted">{event.note}</p>}</li>)}</ol></CardContent></Card>
  </div>;
}
