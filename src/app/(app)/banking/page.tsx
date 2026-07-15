import Link from "next/link";
import { AlertTriangle, BanknoteArrowDown, Landmark, Plus, Search, WalletCards } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { chequeBalance, chequeStatus, type ChequeStatus } from "@/lib/cheques";
import { formatDate, formatLKR, toNum } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export const dynamic = "force-dynamic";

const statusTone: Record<ChequeStatus, "amber" | "red" | "green"> = { UPCOMING: "amber", DUE: "amber", OVERDUE: "red", SETTLED: "green" };

export default async function BankingPage({ searchParams }: { searchParams: Promise<{ q?: string; bank?: string; status?: string }> }) {
  const filters = await searchParams;
  const [accounts, chequeRows] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: [{ bankName: "asc" }, { accountName: "asc" }],
      include: { issuedCheques: { include: { payments: { select: { amount: true } } } } },
    }),
    prisma.issuedCheque.findMany({
      include: {
        supplier: { select: { name: true } },
        bankAccount: { select: { bankName: true, accountName: true, accountNumber: true } },
        payments: { select: { amount: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const cheques = chequeRows.map((cheque) => {
    const paid = cheque.payments.reduce((sum, payment) => sum + toNum(payment.amount), 0);
    const remaining = chequeBalance(toNum(cheque.amount), cheque.payments.map((payment) => toNum(payment.amount)));
    return { ...cheque, paid, remaining, derivedStatus: chequeStatus(cheque.dueDate, remaining) };
  });
  const query = filters.q?.trim().toLowerCase() || "";
  const visible = cheques.filter((cheque) =>
    (!query || cheque.chequeNumber.toLowerCase().includes(query) || cheque.supplier.name.toLowerCase().includes(query)) &&
    (!filters.bank || cheque.bankAccountId === filters.bank) &&
    (!filters.status || cheque.derivedStatus === filters.status),
  );
  const totalOutstanding = cheques.reduce((sum, cheque) => sum + cheque.remaining, 0);
  const riskExposure = cheques.filter((cheque) => cheque.derivedStatus === "DUE" || cheque.derivedStatus === "OVERDUE").reduce((sum, cheque) => sum + cheque.remaining, 0);
  const totalRepaid = cheques.reduce((sum, cheque) => sum + cheque.paid, 0);
  const activeCheques = cheques.filter((cheque) => cheque.remaining > 0).length;

  return (
    <div>
      <PageHeader
        title="Bank & Cheques"
        subtitle="Supplier cheques, bank exposure, due dates, and repayments"
        action={<div className="flex flex-wrap gap-2"><Link href="/banking/accounts/new"><Button variant="outline"><Landmark className="h-4 w-4" /> Add account</Button></Link><Link href="/banking/cheques/new"><Button><Plus className="h-4 w-4" /> Issue cheque</Button></Link></div>}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Cheque summary">
        {[
          { label: "Total outstanding", value: formatLKR(totalOutstanding), icon: WalletCards, tone: "text-primary" },
          { label: "Due / overdue", value: formatLKR(riskExposure), icon: AlertTriangle, tone: riskExposure > 0 ? "text-danger" : "text-muted" },
          { label: "Total repaid", value: formatLKR(totalRepaid), icon: BanknoteArrowDown, tone: "text-primary" },
          { label: "Active cheques", value: String(activeCheques), icon: Landmark, tone: "text-clay" },
        ].map((item) => <Card key={item.label}><CardContent className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted">{item.label}</p><p className="mt-2 text-xl font-extrabold tabular-nums tracking-tight sm:text-2xl">{item.value}</p></div><item.icon className={`h-5 w-5 ${item.tone}`} /></CardContent></Card>)}
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => {
          const liability = account.issuedCheques.reduce((sum, cheque) => sum + chequeBalance(toNum(cheque.amount), cheque.payments.map((payment) => toNum(payment.amount))), 0);
          const limit = account.overdraftLimit == null ? null : toNum(account.overdraftLimit);
          return <Card key={account.id} className="overflow-hidden"><CardContent>
            <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{account.bankName}</p><p className="text-sm text-muted">{account.accountName}{account.branch ? ` · ${account.branch}` : ""}</p><p className="mt-1 font-mono text-xs text-faint">{account.accountNumber}</p></div><Landmark className="h-5 w-5 text-primary" /></div>
            <div className="mt-4 flex items-end justify-between border-t border-border-subtle pt-3"><div><p className="text-xs text-muted">Cheque liability</p><p className="text-lg font-bold tabular-nums">{formatLKR(liability)}</p></div>{limit == null ? <p className="text-right text-xs text-muted">No overdraft<br />limit configured</p> : <div className="text-right"><p className="text-xs text-muted">Facility remaining</p><p className={`font-semibold tabular-nums ${limit - liability < 0 ? "text-danger" : "text-primary-ink"}`}>{formatLKR(limit - liability)}</p><p className="text-[10px] text-faint">of {formatLKR(limit)}</p></div>}</div>
          </CardContent></Card>;
        })}
        {accounts.length === 0 && <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-8 text-center"><Landmark className="mx-auto h-8 w-8 text-faint" /><p className="mt-3 font-semibold">No bank accounts yet</p><p className="mt-1 text-sm text-muted">Add BOC, People&apos;s Bank, or another cheque account to begin.</p><Link href="/banking/accounts/new"><Button className="mt-4" size="sm">Add first account</Button></Link></CardContent></Card>}
      </section>

      <section className="mt-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">Issued cheques</h2><p className="text-sm text-muted">{visible.length} of {cheques.length} cheques</p></div>
          <form className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 sm:w-auto">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><Input name="q" defaultValue={filters.q} placeholder="Cheque or supplier…" className="pl-9" /></div>
            <Select name="bank" defaultValue={filters.bank || ""} aria-label="Filter bank"><option value="">All banks</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.bankName} · {account.accountName}</option>)}</Select>
            <Select name="status" defaultValue={filters.status || ""} aria-label="Filter status"><option value="">All statuses</option><option value="UPCOMING">Upcoming</option><option value="DUE">Due today</option><option value="OVERDUE">Overdue</option><option value="SETTLED">Settled</option></Select>
            <Button type="submit" size="sm" className="col-span-3 sm:col-span-1">Filter</Button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {visible.length === 0 ? <div className="px-5 py-12 text-center"><WalletCards className="mx-auto h-8 w-8 text-faint" /><p className="mt-3 font-semibold">No cheques match these filters</p><p className="mt-1 text-sm text-muted">Issue a cheque or adjust the filters.</p></div> : visible.map((cheque) => {
            const pct = toNum(cheque.amount) > 0 ? Math.min(100, (cheque.paid / toNum(cheque.amount)) * 100) : 0;
            return <Link key={cheque.id} href={`/banking/cheques/${cheque.id}`} className="grid gap-3 border-b border-border-subtle px-4 py-4 transition-colors last:border-0 hover:bg-border-subtle/50 sm:grid-cols-[1.15fr_1.1fr_.9fr_.85fr] sm:items-center">
              <div><div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-primary">#{cheque.chequeNumber}</span><Badge tone={statusTone[cheque.derivedStatus]}>{cheque.derivedStatus}</Badge></div><p className="mt-1 text-sm font-semibold">{cheque.supplier.name}</p></div>
              <div><p className="text-sm font-medium">{cheque.bankAccount.bankName}</p><p className="text-xs text-muted">{cheque.bankAccount.accountName} · {cheque.bankAccount.accountNumber}</p></div>
              <div><p className="text-xs text-muted">Due {formatDate(cheque.dueDate)}</p><p className="mt-1 text-xs tabular-nums">{formatLKR(cheque.paid)} of {formatLKR(cheque.amount)} paid</p><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border-subtle"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div></div>
              <div className="sm:text-right"><p className="text-xs text-muted">Remaining</p><p className={`text-base font-extrabold tabular-nums ${cheque.derivedStatus === "OVERDUE" ? "text-danger" : ""}`}>{formatLKR(cheque.remaining)}</p></div>
            </Link>;
          })}
        </div>
      </section>
    </div>
  );
}
