import Link from "next/link";
import type { LolcReceiptStatus, Prisma } from "@prisma/client";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Plus, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { LolcWorkflowRail } from "@/components/lolc-workflow-rail";
import { LOLC_OPEN_STATUSES, LOLC_STATUSES, lolcReceiptNumber, lolcStatusLabel, lolcStatusTone } from "@/lib/lolc-receipts";
import { prisma } from "@/lib/prisma";
import { formatDate, formatLKR } from "@/lib/utils";

export const dynamic = "force-dynamic";

const summary = [
  { status: "COLLECTED" as const, label: "Waiting to send", icon: Send, className: "text-clay-ink bg-clay-soft" },
  { status: "MCASH_SENT" as const, label: "Waiting for LOLC", icon: Clock3, className: "text-primary-ink bg-primary-soft" },
  { status: "NEEDS_ATTENTION" as const, label: "Needs attention", icon: AlertTriangle, className: "text-danger-ink bg-danger-soft" },
  { status: "LOLC_CONFIRMED" as const, label: "Confirmed", icon: CheckCircle2, className: "text-success-ink bg-success-soft" },
];

function searchWhere(query: string): Prisma.LolcReceiptWhereInput | undefined {
  if (!query) return undefined;
  const normalized = query.replace(/[^\d]/g, "");
  const receiptNumber = normalized ? Number(normalized) : NaN;
  return { OR: [
    { customerName: { contains: query, mode: "insensitive" } },
    { customerPhone: { contains: normalized || query } },
    { lolcCode: { contains: query, mode: "insensitive" } },
    { mCashReference: { contains: query, mode: "insensitive" } },
    ...(Number.isSafeInteger(receiptNumber) ? [{ receiptNumber }] : []),
  ] };
}

export default async function LolcReceiptPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 120);
  const selectedStatus = LOLC_STATUSES.includes(params.status as LolcReceiptStatus) ? params.status as LolcReceiptStatus : "OPEN";
  const where: Prisma.LolcReceiptWhereInput = {
    AND: [
      selectedStatus === "OPEN" ? { status: { in: LOLC_OPEN_STATUSES } } : { status: selectedStatus },
      searchWhere(query) ?? {},
    ],
  };
  const [counts, receipts] = await Promise.all([
    prisma.lolcReceipt.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.lolcReceipt.findMany({ where, orderBy: selectedStatus === "OPEN" ? { collectedAt: "asc" } : { collectedAt: "desc" }, take: 100 }),
  ]);
  const countMap = new Map(counts.map((item) => [item.status, item._count._all]));

  return <div className="mx-auto max-w-7xl">
    <PageHeader title="LOLC Receipts" subtitle="Track customer collections, mCash remittance, and LOLC confirmation." action={
      <Link href="/lolc-receipt/new"><Button><Plus className="h-4 w-4" />New LOLC receipt</Button></Link>
    } />

    <div className="mb-5 rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3 text-sm text-primary-ink">
      <strong>Operational tracking only</strong> — excluded from business accounts and shift cash.
    </div>

    <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="LOLC receipt summary">
      {summary.map((item) => { const Icon = item.icon; return <Link key={item.status} href={`/lolc-receipt?status=${item.status}`} className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/30">
        <div className="flex items-center justify-between"><span className={`rounded-lg p-2 ${item.className}`}><Icon className="h-4 w-4" /></span><span className="tabular text-2xl font-bold text-foreground">{countMap.get(item.status) ?? 0}</span></div>
        <p className="mt-3 text-xs font-semibold text-muted group-hover:text-foreground">{item.label}</p>
      </Link>; })}
    </section>

    <Card>
      <CardContent className="space-y-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_210px_auto]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-faint" /><Input name="q" defaultValue={query} className="pl-9" placeholder="Receipt, customer, phone, LOLC code, or mCash reference" /></div>
          <Select name="status" defaultValue={selectedStatus}><option value="OPEN">Open queues</option>{LOLC_STATUSES.map((status) => <option key={status} value={status}>{lolcStatusLabel(status)}</option>)}</Select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>

        {receipts.length === 0 ? <div className="py-14 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-faint" /><h2 className="mt-3 text-sm font-bold">No matching receipts</h2><p className="mt-1 text-sm text-muted">The selected queue is clear, or no receipt matches this search.</p></div> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted"><th className="px-3 py-3 font-semibold">Receipt</th><th className="px-3 py-3 font-semibold">Customer</th><th className="px-3 py-3 font-semibold">LOLC code</th><th className="px-3 py-3 font-semibold">Collected</th><th className="px-3 py-3 text-right font-semibold">Amount</th><th className="min-w-[220px] px-3 py-3 font-semibold">Workflow / next action</th><th className="w-12" /></tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id} className="border-b border-border-subtle last:border-0 hover:bg-input/60"><td className="px-3 py-3"><Link href={`/lolc-receipt/${receipt.id}`} className="rounded font-mono text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">{lolcReceiptNumber(receipt.receiptNumber)}</Link></td><td className="px-3 py-3"><Link href={`/lolc-receipt/${receipt.id}`} className="rounded font-semibold hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">{receipt.customerName}</Link><p className="text-xs text-muted">{receipt.customerPhone}</p></td><td className="px-3 py-3 font-mono text-xs">{receipt.lolcCode}</td><td className="px-3 py-3"><p>{formatDate(receipt.collectedAt)}</p></td><td className="px-3 py-3 text-right font-semibold tabular">{formatLKR(receipt.amount)}</td><td className="px-3 py-3"><LolcWorkflowRail status={receipt.status} collectedAt={receipt.collectedAt} mCashSent={Boolean(receipt.remittedAt)} lolcConfirmed={Boolean(receipt.confirmedAt)} compact /></td><td className="px-1"><Link href={`/lolc-receipt/${receipt.id}`} aria-label={`Open ${lolcReceiptNumber(receipt.receiptNumber)}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><ArrowRight className="h-5 w-5" /></Link></td></tr>)}</tbody></table></div>
          <div className="space-y-3 md:hidden">{receipts.map((receipt) => <Link href={`/lolc-receipt/${receipt.id}`} key={receipt.id} className="block rounded-xl border border-border p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-primary">{lolcReceiptNumber(receipt.receiptNumber)}</p><p className="mt-1 font-semibold">{receipt.customerName}</p><p className="text-xs text-muted">{receipt.customerPhone} · {receipt.lolcCode}</p></div><Badge tone={lolcStatusTone(receipt.status)}>{lolcStatusLabel(receipt.status)}</Badge></div><LolcWorkflowRail status={receipt.status} collectedAt={receipt.collectedAt} mCashSent={Boolean(receipt.remittedAt)} lolcConfirmed={Boolean(receipt.confirmedAt)} className="mt-4 rounded-lg bg-input/60 px-3 py-3" /><div className="mt-3 flex items-end justify-between border-t border-border-subtle pt-3"><p className="text-xs text-muted">{formatDate(receipt.collectedAt)}</p><p className="font-bold tabular">{formatLKR(receipt.amount)}</p></div></Link>)}</div>
        </>}
      </CardContent>
    </Card>
  </div>;
}
