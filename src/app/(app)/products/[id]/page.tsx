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
import { grossMarginPct } from "@/lib/pricing";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const typeTone = {
  OPENING: "gray",
  PURCHASE: "green",
  SALE: "blue",
  SALE_VOID: "red",
  RETURN: "amber",
  SUPPLIER_RETURN: "red",
  ADJUSTMENT: "amber",
  RESERVATION: "blue",
  RESERVATION_RELEASE: "gray",
  LAYAWAY_HANDOVER: "green",
} as const;

const reasonMeta = {
  PURCHASE_WAC: { label: "Purchase (avg cost)", tone: "green" },
  MANUAL: { label: "Manual edit", tone: "gray" },
  BULK: { label: "Bulk re-price", tone: "blue" },
} as const;

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, movements, ntEnabled, settings, priceChanges] = await Promise.all([
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
    getSettings(),
    prisma.priceChange.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
      take: 50,
    }),
  ]);
  // When non-taxable is off, a non-taxable product effectively doesn't exist —
  // no direct-URL traces.
  if (!product || (!ntEnabled && !product.taxable)) notFound();

  const cost = toNum(product.costPrice);
  const price = toNum(product.sellingPrice);
  const margin = price - cost;
  const marginPct = grossMarginPct(cost, price);
  const target =
    product.targetMarginPct == null
      ? toNum(settings?.defaultTargetMarginPct ?? 20)
      : toNum(product.targetMarginPct);
  const usingDefaultTarget = product.targetMarginPct == null;
  const belowTarget = cost > 0 && price > 0 && marginPct < target - 0.05;
  const low = product.reorderLevel > 0 && product.quantityInStock <= product.reorderLevel;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={product.name}
        subtitle={`#${product.shortCode} · ${product.code}`}
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
            <Row label="Category">
              {product.category.name}
              {product.subcategory ? ` / ${product.subcategory.name}` : ""}
            </Row>
            <Row label="Cost price">{formatLKR(cost)}</Row>
            <Row label="Selling price">{formatLKR(price)}</Row>
            <Row label="Margin">
              {formatLKR(margin)} <span className="text-muted">({marginPct.toFixed(1)}%)</span>
            </Row>
            <Row label="Target margin">
              {target.toFixed(1)}%{usingDefaultTarget && <span className="text-muted"> (default)</span>}
            </Row>
            {belowTarget && (
              <div className="flex items-center justify-between gap-3">
                <Badge tone="amber">Below target</Badge>
                <Link href={`/products/${product.id}/edit`} className="text-xs text-primary hover:underline">
                  Re-price to target →
                </Link>
              </div>
            )}
            <Row label="Physical stock">{product.quantityInStock}</Row>
            <Row label="Reserved"><Badge tone={product.quantityReserved ? "blue" : "gray"}>{product.quantityReserved}</Badge></Row>
            <Row label="Available to sell">{low ? <Badge tone="red">{product.quantityInStock - product.quantityReserved} low</Badge> : product.quantityInStock - product.quantityReserved}</Row>
            <Row label="Reorder level">{product.reorderLevel}</Row>
            <Row label="Model no.">{product.modelNumber ?? "—"}</Row>
            <Row label="Serial no.">{product.serialNumber ?? "—"}</Row>
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

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Price history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {priceChanges.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              No price changes recorded yet. Cost updates on each purchase (weighted average);
              selling-price edits and bulk re-pricing also appear here.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Reason</TH>
                  <TH className="text-right">Cost</TH>
                  <TH className="text-right">Selling</TH>
                  <TH>Note</TH>
                  <TH>By</TH>
                </TR>
              </THead>
              <TBody>
                {priceChanges.map((c) => {
                  const meta = reasonMeta[c.reason];
                  return (
                    <TR key={c.id}>
                      <TD className="text-muted">{formatDateTime(c.createdAt)}</TD>
                      <TD>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </TD>
                      <TD className="text-right">
                        <Delta from={toNum(c.oldCostPrice)} to={toNum(c.newCostPrice)} />
                      </TD>
                      <TD className="text-right">
                        <Delta from={toNum(c.oldSellingPrice)} to={toNum(c.newSellingPrice)} />
                      </TD>
                      <TD className="text-muted">{c.note ?? "—"}</TD>
                      <TD className="text-muted">{c.createdBy?.name ?? "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Shows "old → new" when a value changed, or just the value (muted) when not. */
function Delta({ from, to }: { from: number; to: number }) {
  if (from === to) return <span className="text-muted">{formatLKR(to)}</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted">{formatLKR(from)}</span>
      <span className="text-muted"> → </span>
      <span className="font-semibold text-foreground">{formatLKR(to)}</span>
    </span>
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
