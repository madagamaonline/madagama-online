import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireStaffFinanceAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeOpenAccountState } from "@/lib/open-account";
import { formatDate, formatLKR, toNum } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/list-search";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function OpenAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireStaffFinanceAccess();
  const { q = "", status = "active" } = await searchParams;
  const query = q.trim();
  const where: Prisma.OpenAccountWhereInput = {
    ...(status === "settled" ? { status: "SETTLED" } : status === "all" ? {} : { status: "ACTIVE" }),
    invoice: { voidedAt: null },
    ...(query ? { OR: [{ customer: { name: { contains: query, mode: "insensitive" } } }, { invoice: { invoiceNumber: { contains: query, mode: "insensitive" } } }] } : {}),
  };
  const accounts = await prisma.openAccount.findMany({ where, orderBy: [{ dueDate: "asc" }, { openedAt: "desc" }], include: { customer: true, invoice: true, payments: true } });
  const rows = accounts.map((a) => ({ account: a, state: computeOpenAccountState(toNum(a.principal), a.payments.map((p) => ({ amount: toNum(p.amount), method: p.method })), a.dueDate) })).filter((r) => status !== "overdue" || r.state.isOverdue);
  const outstanding = rows.reduce((sum, row) => sum + row.state.outstanding, 0);
  return <div>
    <PageHeader title="Customer Balances" subtitle="Pay Later accounts and collections" />
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"><CircleDollarSign className="h-5 w-5" /><span className="text-sm">Outstanding across this view</span><strong className="ml-auto text-lg tabular-nums">{formatLKR(outstanding)}</strong></div>
    <Card><CardContent className="p-0">
      <div className="space-y-3 border-b border-border p-4 md:flex md:items-center md:justify-between md:space-y-0"><ListSearch placeholder="Search customer or invoice…" className="max-w-md flex-1" /><div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:pb-0">{[["Active","active"],["Overdue","overdue"],["Settled","settled"],["All","all"]].map(([label,value]) => <Link key={value} href={`/open-accounts?status=${value}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${status === value ? "bg-primary text-primary-foreground" : "bg-border-subtle text-muted"}`}>{label}</Link>)}</div></div>
      {rows.length === 0 ? <div className="px-5 py-12 text-center text-sm text-muted">No customer balances match this view.</div> : <>
        <div className="divide-y divide-border md:hidden">{rows.map(({ account: a, state }) => <Link href={`/open-accounts/${a.id}`} key={a.id} className="block p-4 transition-colors hover:bg-border-subtle/40"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-foreground">{a.customer.name}</p><p className="text-xs text-muted">{a.customer.phone} · <span className="font-mono">{a.invoice.invoiceNumber}</span></p></div><Badge tone={a.status === "SETTLED" ? "green" : state.isOverdue ? "red" : "amber"}>{a.status === "SETTLED" ? "PAID" : state.isOverdue ? "OVERDUE" : state.credited ? "PARTIAL" : "UNPAID"}</Badge></div><div className="mt-3 flex items-end justify-between gap-3"><div className="text-xs text-muted"><p>Opened {formatDate(a.openedAt)}</p><p className={state.isOverdue ? "font-semibold text-danger" : ""}>{a.dueDate ? `Promised ${formatDate(a.dueDate)}` : "No promised date"}</p><p className="mt-1">Collected {formatLKR(state.credited)}</p></div><div className="text-right"><p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Balance due</p><p className="text-xl font-bold tabular-nums text-amber-950">{formatLKR(state.outstanding)}</p></div></div></Link>)}</div>
        <div className="hidden md:block"><Table><THead><TR><TH>Customer</TH><TH>Invoice</TH><TH>Opened / promised</TH><TH>Status</TH><TH className="text-right">Collected</TH><TH className="text-right">Balance</TH></TR></THead><TBody>{rows.map(({ account: a, state }) => <TR key={a.id}><TD><Link className="font-medium text-primary hover:underline" href={`/open-accounts/${a.id}`}>{a.customer.name}</Link><div className="text-xs text-muted">{a.customer.phone}</div></TD><TD><Link className="font-mono text-primary hover:underline" href={`/invoices/${a.invoiceId}`}>{a.invoice.invoiceNumber}</Link></TD><TD><div>{formatDate(a.openedAt)}</div><div className={state.isOverdue ? "text-xs font-semibold text-danger" : "text-xs text-muted"}>{a.dueDate ? `Promised ${formatDate(a.dueDate)}` : "No promised date"}</div></TD><TD><Badge tone={a.status === "SETTLED" ? "green" : state.isOverdue ? "red" : "amber"}>{a.status === "SETTLED" ? "PAID" : state.isOverdue ? "OVERDUE" : state.credited ? "PARTIAL" : "UNPAID"}</Badge></TD><TD className="text-right tabular-nums">{formatLKR(state.credited)}</TD><TD className="text-right font-semibold tabular-nums text-amber-950">{formatLKR(state.outstanding)}</TD></TR>)}</TBody></Table></div>
      </>}
    </CardContent></Card>
  </div>;
}
