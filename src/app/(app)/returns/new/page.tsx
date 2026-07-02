import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ReturnForm, type ReturnLine } from "@/components/return-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { computeCreditState } from "@/lib/credit";
import { toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const { invoice: invoiceId } = await searchParams;

  if (!invoiceId) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="New Return" subtitle="Restock returned items and record a refund" />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            Open an invoice and click <b>Return items</b> to start a return.
            <div className="mt-4">
              <Link href="/invoices">
                <Button variant="outline">Go to invoices</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      customer: { select: { name: true } },
      creditAgreement: { include: { payments: true } },
    },
  });
  if (!invoice) notFound();

  // For a credit sale that is still owed on, the refund is credited against the
  // customer's balance instead of paid out — tell the form so it can say so.
  const agreement = invoice.creditAgreement;
  const creditOutstanding =
    agreement && agreement.status !== "SETTLED"
      ? computeCreditState(
          {
            principal: toNum(agreement.principal),
            startDate: agreement.startDate,
            interestRatePerMonth: toNum(agreement.interestRatePerMonth),
            interestFreeMonths: agreement.interestFreeMonths,
          },
          agreement.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate })),
        ).outstanding
      : null;

  // Only items still linked to a product can be restocked.
  const lines: ReturnLine[] = invoice.items
    .filter((it) => it.productId)
    .map((it) => ({
      productId: it.productId as string,
      code: it.codeSnapshot ?? "",
      name: it.nameSnapshot,
      sold: it.qty,
      unitPrice: toNum(it.unitPrice),
    }));

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
        title={`Return — ${invoice.invoiceNumber}`}
        subtitle={`${invoice.customer?.name ?? "Walk-in"} · choose quantities to return`}
      />
      {lines.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            None of the items on this invoice can be restocked (the products were removed).
          </CardContent>
        </Card>
      ) : (
        <ReturnForm invoiceId={invoice.id} lines={lines} creditOutstanding={creditOutstanding} />
      )}
    </div>
  );
}
