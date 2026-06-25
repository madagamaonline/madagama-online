import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StockAdjustForm } from "@/components/stock-adjust-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, formatDateTime, toNum } from "@/lib/utils";
import { nonTaxableEnabled } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

const typeTone = {
  OPENING: "gray",
  PURCHASE: "green",
  SALE: "blue",
  RETURN: "amber",
  ADJUSTMENT: "amber",
} as const;

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, movements, ntEnabled] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { category: true, subcategory: true, primarySupplier: { select: { name: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
      take: 100,
    }),
    nonTaxableEnabled(),
  ]);
  // When non-taxable is off, a non-taxable product effectively doesn't exist —
  // no direct-URL traces.
  if (!product || (!ntEnabled && !product.taxable)) notFound();

  const cost = toNum(product.costPrice);
  const price = toNum(product.sellingPrice);
  const margin = price - cost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;
  const low = product.reorderLevel > 0 && product.quantityInStock <= product.reorderLevel;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={product.name}
        subtitle={product.code}
        action={
          <Link href={`/products/${product.id}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Category">{product.category.name} / {product.subcategory.name}</Row>
            <Row label="Cost price">{formatLKR(cost)}</Row>
            <Row label="Selling price">{formatLKR(price)}</Row>
            <Row label="Margin">
              {formatLKR(margin)} <span className="text-muted">({marginPct.toFixed(1)}%)</span>
            </Row>
            <Row label="Stock">
              {low ? <Badge tone="red">{product.quantityInStock} low</Badge> : product.quantityInStock}
            </Row>
            <Row label="Reorder level">{product.reorderLevel}</Row>
            <Row label="Supplier">{product.primarySupplier?.name ?? "—"}</Row>
            {ntEnabled && <Row label="Tax">{product.taxable ? "Taxable" : "Non-taxable"}</Row>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adjust stock</CardTitle>
          </CardHeader>
          <CardContent>
            <StockAdjustForm productId={product.id} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Stock value (cost)">{formatLKR(cost * product.quantityInStock)}</Row>
            <Row label="Movements logged">{movements.length}</Row>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Stock movement history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {movements.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">No movements recorded yet.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Change</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Reason</TH>
                  <TH>By</TH>
                </TR>
              </THead>
              <TBody>
                {movements.map((m) => (
                  <TR key={m.id}>
                    <TD className="text-muted">{formatDateTime(m.createdAt)}</TD>
                    <TD>
                      <Badge tone={typeTone[m.type]}>{m.type}</Badge>
                    </TD>
                    <TD className={`text-right font-medium ${m.qty < 0 ? "text-danger" : "text-green-700"}`}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </TD>
                    <TD className="text-right">{m.balanceAfter}</TD>
                    <TD className="text-muted">{m.reason ?? "—"}</TD>
                    <TD className="text-muted">{m.createdBy?.name ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
