import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChequeCalendar } from "@/components/cheque-calendar";
import { chequeBalance, chequeStatus } from "@/lib/cheques";
import { parseMonthKey } from "@/lib/cheque-calendar";
import { businessDayKey } from "@/lib/dates";
import { toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ChequeCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = parseMonthKey((await searchParams).month);
  const today = businessDayKey(new Date());
  const [rows, accounts] = await Promise.all([
    prisma.issuedCheque.findMany({ include: { supplier: { select: { name: true } }, bankAccount: { select: { id: true, bankName: true, accountName: true, accountNumber: true } }, payments: { select: { amount: true } } }, orderBy: { dueDate: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: [{ bankName: "asc" }, { accountName: "asc" }] }),
  ]);
  const events = rows.map((row) => {
    const amount = toNum(row.amount);
    const remaining = chequeBalance(amount, row.payments.map((payment) => toNum(payment.amount)));
    return { id: row.id, dueKey: businessDayKey(row.dueDate), chequeNumber: row.chequeNumber, supplier: row.supplier.name, bankAccountId: row.bankAccount.id, bank: row.bankAccount.bankName, account: `${row.bankAccount.accountName} · ${row.bankAccount.accountNumber}`, amount, remaining, status: chequeStatus(row.dueDate, remaining) };
  });
  return <div>
    <PageHeader title="Cheque calendar" subtitle="See every supplier commitment at a glance — tap a day for the exact agenda." action={<Link href="/banking/cheques/new"><Button><Plus className="h-4 w-4"/>Issue cheque</Button></Link>} />
    <div className="mb-4 rounded-xl border border-primary/15 bg-primary-soft/35 px-4 py-3 text-sm text-primary-ink"><CalendarDays className="mr-2 inline h-4 w-4"/>Overdue cheques stay pinned above the month, so older risk is never hidden.</div>
    <ChequeCalendar month={month} today={today} events={events} banks={accounts.map((account) => ({ id: account.id, label: `${account.bankName} · ${account.accountName}` }))} />
  </div>;
}
