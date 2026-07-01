import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const methodLabel: Record<string, string> = {
  REDUCE_PAYABLE: "Credit note",
  CASH_REFUND: "Cash refund",
  REPLACEMENT: "Replacement",
};
const methodTone: Record<string, "green" | "amber" | "gray"> = {
  REDUCE_PAYABLE: "green",
  CASH_REFUND: "amber",
  REPLACEMENT: "gray",
};

export default async function SupplierReturnsPage() {
  const returns = await prisma.supplierReturn.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { name: true, id: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Supplier Returns" subtitle="Stock sent back to suppliers" />
      <Card>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              No supplier returns yet. Open a purchase and click “Return to supplier”.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Supplier</TH>
                  <TH className="text-right">Items</TH>
                  <TH>Settlement</TH>
                  <TH>Reason</TH>
                  <TH>By</TH>
                  <TH className="text-right">Value</TH>
                </TR>
              </THead>
              <TBody>
                {returns.map((r) => (
                  <TR key={r.id}>
                    <TD className="text-muted">{formatDateTime(r.createdAt)}</TD>
                    <TD>
                      <Link href={`/suppliers/${r.supplier.id}`} className="text-primary hover:underline">
                        {r.supplier.name}
                      </Link>
                    </TD>
                    <TD className="text-right">{r._count.items}</TD>
                    <TD>
                      <Badge tone={methodTone[r.method] ?? "gray"}>
                        {methodLabel[r.method] ?? r.method}
                      </Badge>
                    </TD>
                    <TD className="text-muted">{r.reason ?? "—"}</TD>
                    <TD className="text-muted">{r.createdBy?.name ?? "—"}</TD>
                    <TD className="text-right font-medium">{formatLKR(r.totalValue)}</TD>
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
