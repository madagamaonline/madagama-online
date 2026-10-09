import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ReturnForm, type ReturnLine } from "@/components/return-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { computeCreditState } from "@/lib/credit";
import { customerReturnAllowances } from "@/lib/return-values";
import { computeOpenAccountState } from "@/lib/open-account";
import { toNum } from "@/lib/utils";
import { businessDaysBetween } from "@/lib/dates";
import { BillFinder } from "./bill-finder";

export const dynamic = "force-dynamic";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; product?: string; q?: string; from?: string; to?: string }>;
}) {
  const { invoice: invoiceId, product: prefillProductId, q, from, to } = await searchParams;

  if (!invoiceId) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Return / Exchange" subtitle="Find the customer's bill, then choose the items coming back" />
        <BillFinder q={q} from={from} to={to} />
      </div>
    );
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      returns: { include: { items: { select: { productId: true, qty: true, lineTotal: true } } } },
      customer: { select: { id: true, name: true, phone: true, nic: true } },
      creditAgreement: { include: { payments: true } },
      openAccount: { include: { payments: true } },
    },
  });
  if (!invoice) notFound();

  if (invoice.voidedAt) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <Link href={`/invoices/${invoice.id}`}><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Back to invoice</Button></Link>
        </div>
        <Card><CardContent className="py-10 text-center text-sm text-muted">This invoice is voided. Its stock was already restored, so it cannot receive a return.</CardContent></Card>
      </div>
    );
  }

  // For a credit sale that is still owed on, the refund is credited against the
  // customer's balance instead of paid out — tell the form so it can say so.
  const agreement = invoice.creditAgreement;
  const creditOutstanding =
    agreement && agreement.status !== "SETTLED" && agreement.status !== "VOIDED"
      ? computeCreditState(
          {
            principal: toNum(agreement.principal),
            startDate: agreement.startDate,
            interestRatePerMonth: toNum(agreement.interestRatePerMonth),
            interestFreeMonths: agreement.interestFreeMonths,
          },
          agreement.payments.map((p) => ({ amount: toNum(p.amount), discount: toNum(p.discount), paidDate: p.paidDate })),
        ).outstanding
      : invoice.openAccount?.status === "ACTIVE"
        ? computeOpenAccountState(toNum(invoice.openAccount.principal), invoice.openAccount.payments.map((p) => ({ amount: toNum(p.amount), method: p.method }))).outstanding
        : null;

  const allowances = customerReturnAllowances(
    toNum(invoice.grandTotal),
    invoice.items.map((it) => ({ ...it, qty: toNum(it.qty), unitPrice: toNum(it.unitPrice), unitDiscount: toNum(it.unitDiscount) })),
    invoice.returns.map((ret) => ({ totalRefund: toNum(ret.totalRefund), items: ret.items.map((it) => ({ ...it, qty: toNum(it.qty), lineTotal: toNum(it.lineTotal) })) })),
  );
  const lines: ReturnLine[] = [...allowances].filter(([, allowance]) => allowance.qty > 0).map(([productId, allowance]) => {
    const item = invoice.items.find((it) => it.productId === productId)!;
    return { productId, code: item.codeSnapshot ?? "", name: item.nameSnapshot, sold: allowance.qty,
      refundableValue: allowance.value, unit: item.unit, unitPrice: allowance.value / allowance.qty };
  });

  const daysAgo = businessDaysBetween(invoice.createdAt);
  const soldAgo = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href={`/invoices/${invoice.id}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to invoice
          </Button>
        </Link>
      </div>
      <PageHeader
        title={`Return / Exchange — ${invoice.invoiceNumber}`}
        subtitle={`${invoice.customer?.name ?? "Walk-in"} · sold ${soldAgo} · choose the items coming back`}
      />
      {lines.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            None of the items on this invoice can be restocked (the products were removed).
          </CardContent>
        </Card>
      ) : (
        <ReturnForm
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          customer={invoice.customer}
          lines={lines}
          creditOutstanding={creditOutstanding}
          prefillProductId={prefillProductId}
        />
      )}
    </div>
  );
}
