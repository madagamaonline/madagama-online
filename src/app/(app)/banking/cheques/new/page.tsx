import Link from "next/link";
import { Landmark } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { IssueChequeForm } from "@/components/issue-cheque-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function NewChequePage({ searchParams }: { searchParams: Promise<{ supplier?: string; purchase?: string }> }) {
  const defaults = await searchParams;
  const [suppliers, accounts, purchaseRows] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: [{ bankName: "asc" }, { accountName: "asc" }], select: { id: true, bankName: true, accountName: true, accountNumber: true } }),
    prisma.purchase.findMany({ where: { status: { in: ["CREDIT", "PARTIAL"] } }, orderBy: { date: "desc" }, select: { id: true, supplierId: true, supplierInvoiceNo: true, date: true, total: true, amountPaid: true } }),
  ]);
  const purchases = purchaseRows.map((purchase) => ({ id: purchase.id, supplierId: purchase.supplierId, ref: purchase.supplierInvoiceNo?.trim() || `Purchase ${purchase.id.slice(-6)}`, date: purchase.date.toISOString(), remaining: Math.max(0, toNum(purchase.total) - toNum(purchase.amountPaid)) })).filter((purchase) => purchase.remaining > 0);

  return <div className="mx-auto max-w-5xl"><PageHeader title="Issue supplier cheque" subtitle="Move a supplier balance into a trackable bank cheque liability" />
    {accounts.length === 0 ? <Card><CardContent className="py-10 text-center"><Landmark className="mx-auto h-9 w-9 text-faint" /><p className="mt-3 font-semibold">Add a bank account first</p><p className="mt-1 text-sm text-muted">A cheque must be issued from a registered active account.</p><Link href="/banking/accounts/new"><Button className="mt-4">Add bank account</Button></Link></CardContent></Card> : <IssueChequeForm suppliers={suppliers} accounts={accounts} purchases={purchases} defaultSupplierId={defaults.supplier} defaultPurchaseId={defaults.purchase} />}
  </div>;
}
