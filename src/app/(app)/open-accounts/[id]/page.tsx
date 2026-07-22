import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ReceiptText } from "lucide-react";
import { requireStaffFinanceAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeOpenAccountState } from "@/lib/open-account";
import { formatDate, formatDateTime, formatLKR, toNum } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecordOpenAccountPayment } from "@/components/record-open-account-payment";
import { SendOpenAccountReminder } from "@/components/send-open-account-reminder";

export const dynamic = "force-dynamic";

export default async function OpenAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffFinanceAccess();
  const { id } = await params;
  const account = await prisma.openAccount.findUnique({ where: { id }, include: { customer: true, invoice: true, payments: { orderBy: [{ paidDate: "desc" }, { createdAt: "desc" }], include: { recordedBy: { select: { name: true } } } } } });
  if (!account) notFound();
  const state = computeOpenAccountState(toNum(account.principal), account.payments.map((p) => ({ amount: toNum(p.amount), method: p.method })), account.dueDate);
  return <div className="mx-auto max-w-5xl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><Link href="/open-accounts"><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Customer Balances</Button></Link><div className="flex gap-2">{!state.isSettled && <SendOpenAccountReminder accountId={account.id} compact />}<Link href={`/invoices/${account.invoiceId}`}><Button variant="outline"><ReceiptText className="h-4 w-4" /> View invoice</Button></Link></div></div>
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">{account.customer.name}</p><h1 className="text-2xl font-bold">{formatLKR(state.outstanding)} due</h1><p className="text-sm text-amber-800">Invoice {account.invoice.invoiceNumber} · No interest or guarantor</p></div><Badge tone={account.status === "SETTLED" ? "green" : state.isOverdue ? "red" : "amber"} className="sm:ml-auto">{account.status === "SETTLED" ? "PAID" : state.isOverdue ? "OVERDUE" : state.credited ? "PARTIAL" : "UNPAID"}</Badge></div>
    <div className="grid gap-5 lg:grid-cols-3"><div className="space-y-5 lg:col-span-2"><Card><CardHeader><CardTitle>Account summary</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><div><span className="text-muted">Original total</span><strong className="block tabular-nums">{formatLKR(state.principal)}</strong></div><div><span className="text-muted">Payments</span><strong className="block tabular-nums">{formatLKR(state.cashCollected)}</strong></div><div><span className="text-muted">Return credits</span><strong className="block tabular-nums">{formatLKR(state.returnCredits)}</strong></div><div><span className="text-muted">Promised</span><strong className="block">{account.dueDate ? formatDate(account.dueDate) : "Not set"}</strong></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Payment history</CardTitle></CardHeader><CardContent className="p-0">{account.payments.length === 0 ? <div className="px-5 py-10 text-center text-sm text-muted">No payments recorded yet.</div> : <div className="divide-y divide-border">{account.payments.map((p) => <div key={p.id} className="flex items-start justify-between gap-3 px-5 py-3"><div><div className="font-medium">{p.method === "RETURN" ? "Return credit" : p.method}</div><div className="text-xs text-muted">Effective {formatDate(p.paidDate)} · recorded {formatDateTime(p.createdAt)}{p.recordedBy?.name ? ` by ${p.recordedBy.name}` : ""}</div>{p.note && <div className="mt-1 text-xs text-muted">{p.note}</div>}</div><strong className="tabular-nums">{formatLKR(p.amount)}</strong></div>)}</div>}</CardContent></Card></div>
      <Card className="h-fit"><CardHeader><CardTitle>{state.isSettled ? "Account settled" : "Record payment"}</CardTitle></CardHeader><CardContent>{state.isSettled ? <div className="text-center text-sm text-muted"><CalendarClock className="mx-auto mb-2 h-8 w-8 text-success" />Nothing more is due.</div> : <RecordOpenAccountPayment accountId={account.id} outstanding={state.outstanding} />}</CardContent></Card></div>
  </div>;
}
