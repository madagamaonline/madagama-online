import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PurchasePayment } from "@/components/purchase-payment";
import { formatLKR, formatDate, formatDateTime, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusTone = { PAID: "green", PARTIAL: "amber", CREDIT: "red" } as const;

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { include: { product: { select: { code: true, name: true } } } },
      payments: { orderBy: { paidDate: "desc" } },
    },
  });
  if (!purchase) notFound();

  const balance = Math.max(0, toNum(purchase.total) - toNum(purchase.amountPaid));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Purchase — ${purchase.supplier.name}`}
        subtitle={`${formatDate(purchase.date)}${purchase.supplierInvoiceNo ? ` · ${purchase.supplierInvoiceNo}` : ""}`}
        action={
          <Link href={`/suppliers/${purchase.supplierId}`} className="text-sm font-medium text-primary hover:underline">
            View supplier
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items received</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Item</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Unit Cost</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {purchase.items.map((it) => (
                  <TR key={it.id}>
                    <TD className="font-mono text-xs">{it.product.code}</TD>
                    <TD>{it.product.name}</TD>
                    <TD className="text-right">{it.qty}</TD>
                    <TD className="text-right">{formatLKR(it.costPrice)}</TD>
                    <TD className="text-right font-medium">{formatLKR(it.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Payment</CardTitle>
            <Badge tone={statusTone[purchase.status]}>{purchase.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Total</span>
              <span>{formatLKR(purchase.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Paid</span>
              <span>{formatLKR(purchase.amountPaid)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Balance</span>
              <span>{formatLKR(balance)}</span>
            </div>
            {purchase.creditDueDate && (
              <p className="text-xs text-muted">Due: {formatDate(purchase.creditDueDate)}</p>
            )}
            {balance > 0 && (
              <div className="border-t border-border pt-3">
                <PurchasePayment purchaseId={purchase.id} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {purchase.payments.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Note</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {purchase.payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{formatDateTime(p.paidDate)}</TD>
                    <TD className="text-muted">{p.note ?? "—"}</TD>
                    <TD className="text-right font-medium">{formatLKR(p.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
