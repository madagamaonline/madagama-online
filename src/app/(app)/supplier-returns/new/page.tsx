import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SupplierReturnForm, type SupplierReturnLine } from "@/components/supplier-return-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NewSupplierReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const { purchase: purchaseId } = await searchParams;

  if (!purchaseId) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Return to Supplier" subtitle="Send stock back to a supplier" />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            Open a purchase and click <b>Return to supplier</b> to start.
            <div className="mt-4">
              <Link href="/purchases">
                <Button variant="outline">Go to purchases</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: { select: { name: true } },
      items: {
        include: {
          product: { select: { id: true, code: true, name: true, quantityInStock: true } },
        },
      },
    },
  });
  if (!purchase) notFound();

  const balance = Math.max(0, toNum(purchase.total) - toNum(purchase.amountPaid));

  const lines: SupplierReturnLine[] = purchase.items.map((it) => ({
    productId: it.product.id,
    code: it.product.code,
    name: it.product.name,
    purchased: it.qty,
    inStock: it.product.quantityInStock,
    unitCost: toNum(it.costPrice),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href={`/purchases/${purchase.id}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to purchase
          </Button>
        </Link>
      </div>
      <PageHeader
        title={`Return to ${purchase.supplier.name}`}
        subtitle={`Purchase ${formatDate(purchase.date)}${purchase.supplierInvoiceNo ? ` · ${purchase.supplierInvoiceNo}` : ""} · choose quantities to send back`}
      />
      {lines.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            This purchase has no items to return.
          </CardContent>
        </Card>
      ) : (
        <SupplierReturnForm purchaseId={purchase.id} balance={balance} lines={lines} />
      )}
    </div>
  );
}
