import Link from "next/link";
import { ArrowLeftRight, Undo2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatLKR, formatDateTime } from "@/lib/utils";
import { returnSettlementLabel } from "@/lib/returns";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const returns = await prisma.salesReturn.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      invoice: { select: { invoiceNumber: true, id: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
      items: { where: { restocked: false }, select: { id: true } },
    },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Returns"
        subtitle="Returned items, refunds and exchanges"
        action={
          <Link href="/returns/new">
            <Button><Undo2 className="h-4 w-4" /> New return / exchange</Button>
          </Link>
        }
      />
      <Card>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              No returns yet. Click “New return / exchange” to find the customer&apos;s bill.
            </div>
          ) : (
            <>
              <div className="md:hidden">
                {returns.map((r) => (
                  <div key={r.id} className="border-b border-border-subtle p-4 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {r.invoice ? (
                          <Link href={`/invoices/${r.invoice.id}`} className="font-medium text-primary hover:underline">
                            {r.invoice.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="font-medium">—</span>
                        )}
                        <div className="mt-0.5 text-xs text-muted">
                          {formatDateTime(r.createdAt)}
                          {r.createdBy?.name ? ` · ${r.createdBy.name}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium">{formatLKR(r.totalRefund)}</span>
                    </div>
                    <div className="mt-2 text-sm text-muted">
                      {r._count.items} item{r._count.items === 1 ? "" : "s"} · {returnSettlementLabel(r)}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                    <ReturnExtras exchangeSaleGroupId={r.exchangeSaleGroupId} damaged={r.items.length} />
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>When</TH>
                      <TH>Invoice</TH>
                      <TH className="text-right">Items</TH>
                      <TH>Method</TH>
                      <TH>Reason</TH>
                      <TH>By</TH>
                      <TH className="text-right">Refund</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {returns.map((r) => (
                      <TR key={r.id}>
                        <TD className="text-muted">{formatDateTime(r.createdAt)}</TD>
                        <TD>
                          {r.invoice ? (
                            <Link href={`/invoices/${r.invoice.id}`} className="text-primary hover:underline">
                              {r.invoice.invoiceNumber}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD className="text-right">{r._count.items}</TD>
                        <TD>
                          {returnSettlementLabel(r)}
                          <ReturnExtras exchangeSaleGroupId={r.exchangeSaleGroupId} damaged={r.items.length} />
                        </TD>
                        <TD className="text-muted">{r.reason ?? "—"}</TD>
                        <TD className="text-muted">{r.createdBy?.name ?? "—"}</TD>
                        <TD className="text-right font-medium">{formatLKR(r.totalRefund)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReturnExtras({ exchangeSaleGroupId, damaged }: { exchangeSaleGroupId: string | null; damaged: number }) {
  if (!exchangeSaleGroupId && !damaged) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      {exchangeSaleGroupId && (
        <Link href={`/invoices/groups/${exchangeSaleGroupId}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <ArrowLeftRight className="h-3 w-3" /> New sale
        </Link>
      )}
      {damaged > 0 && <Badge tone="red">{damaged} damaged</Badge>}
    </div>
  );
}
