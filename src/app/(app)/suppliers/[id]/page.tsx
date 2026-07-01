import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { DeleteButton } from "@/components/delete-button";
import { deleteSupplier } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, formatDate, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusTone = { PAID: "green", PARTIAL: "amber", CREDIT: "red" } as const;

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      purchases: { orderBy: { date: "desc" } },
      returns: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { items: true } } },
      },
    },
  });
  if (!supplier) notFound();

  const payable = supplier.purchases.reduce(
    (s, p) => s + Math.max(0, toNum(p.total) - toNum(p.amountPaid)),
    0,
  );
  const returnedValue = supplier.returns.reduce((s, r) => s + toNum(r.totalValue), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={supplier.name}
        subtitle="Supplier details"
        action={
          <div className="flex gap-2">
            <Link href={`/suppliers/${supplier.id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
            <Link href={`/purchases/new?supplier=${supplier.id}`}>
              <Button>
                <Plus className="h-4 w-4" /> New Purchase
              </Button>
            </Link>
            <DeleteButton
              onDelete={deleteSupplier.bind(null, supplier.id)}
              confirmText={`Delete supplier "${supplier.name}"? This cannot be undone.`}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {supplier.contactPerson && <p>{supplier.contactPerson}</p>}
            {supplier.phone && <p className="text-muted">{supplier.phone}</p>}
            {supplier.email && <p className="text-muted">{supplier.email}</p>}
            {supplier.address && <p className="text-muted">{supplier.address}</p>}
            <div className="mt-3 rounded-lg bg-clay-soft px-3 py-2">
              <p className="text-xs text-clay-ink/80">Total payable</p>
              <p className="text-lg font-semibold text-clay-ink">{formatLKR(payable)}</p>
            </div>
            {returnedValue > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-border-subtle px-3 py-2 text-xs text-muted">
                <span>Returned to supplier</span>
                <span className="font-medium">{formatLKR(returnedValue)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Purchases</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {supplier.purchases.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">No purchases recorded.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Ref</TH>
                    <TH>Type</TH>
                    <TH>Due</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {supplier.purchases.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/purchases/${p.id}`} className="text-primary hover:underline">
                          {formatDate(p.date)}
                        </Link>
                      </TD>
                      <TD className="text-muted">{p.supplierInvoiceNo ?? "—"}</TD>
                      <TD>{p.type}</TD>
                      <TD className="text-muted">{p.creditDueDate ? formatDate(p.creditDueDate) : "—"}</TD>
                      <TD className="text-right font-medium">{formatLKR(p.total)}</TD>
                      <TD>
                        <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {supplier.returns.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Returns to supplier</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH className="text-right">Items</TH>
                  <TH>Settlement</TH>
                  <TH>Reason</TH>
                  <TH className="text-right">Credited</TH>
                  <TH className="text-right">Value</TH>
                </TR>
              </THead>
              <TBody>
                {supplier.returns.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      {r.purchaseId ? (
                        <Link href={`/purchases/${r.purchaseId}`} className="text-primary hover:underline">
                          {formatDate(r.date)}
                        </Link>
                      ) : (
                        formatDate(r.date)
                      )}
                    </TD>
                    <TD className="text-right">{r._count.items}</TD>
                    <TD>
                      {r.method === "REDUCE_PAYABLE"
                        ? "Credit note"
                        : r.method === "CASH_REFUND"
                          ? "Cash refund"
                          : "Replacement"}
                    </TD>
                    <TD className="text-muted">{r.reason ?? "—"}</TD>
                    <TD className="text-right text-muted">{formatLKR(r.appliedToPayable)}</TD>
                    <TD className="text-right font-medium">{formatLKR(r.totalValue)}</TD>
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
