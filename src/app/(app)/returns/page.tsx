import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const returns = await prisma.salesReturn.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      invoice: { select: { invoiceNumber: true, id: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Returns" subtitle="Returned items and refunds" />
      <Card>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              No returns yet. Open an invoice and click “Return items”.
            </div>
          ) : (
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
                    <TD>{r.method}</TD>
                    <TD className="text-muted">{r.reason ?? "—"}</TD>
                    <TD className="text-muted">{r.createdBy?.name ?? "—"}</TD>
                    <TD className="text-right font-medium">{formatLKR(r.totalRefund)}</TD>
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
