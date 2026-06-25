import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, formatDate, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusTone = { PAID: "green", PARTIAL: "amber", CREDIT: "red" } as const;

export default async function PurchasesPage() {
  const purchases = await prisma.purchase.findMany({
    orderBy: { date: "desc" },
    include: { supplier: { select: { name: true } } },
    take: 200,
  });

  const payable = purchases.reduce(
    (s, p) => s + Math.max(0, toNum(p.total) - toNum(p.amountPaid)),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Stock received from suppliers"
        action={
          <Link href="/purchases/new">
            <Button>
              <Plus className="h-4 w-4" /> New Purchase
            </Button>
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total Payable to Suppliers" value={formatLKR(payable)} tone="amber" />
        <StatCard label="Purchases Recorded" value={String(purchases.length)} tone="blue" />
      </div>

      <Card>
        <CardContent className="p-0">
          {purchases.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">No purchases yet.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Supplier</TH>
                  <TH>Ref</TH>
                  <TH>Type</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {purchases.map((p) => {
                  const bal = Math.max(0, toNum(p.total) - toNum(p.amountPaid));
                  return (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/purchases/${p.id}`} className="text-primary hover:underline">
                          {formatDate(p.date)}
                        </Link>
                      </TD>
                      <TD>{p.supplier.name}</TD>
                      <TD className="text-muted">{p.supplierInvoiceNo ?? "—"}</TD>
                      <TD>{p.type}</TD>
                      <TD className="text-muted">{p.creditDueDate ? formatDate(p.creditDueDate) : "—"}</TD>
                      <TD className="text-right">{formatLKR(p.total)}</TD>
                      <TD className="text-right font-medium">{formatLKR(bal)}</TD>
                      <TD>
                        <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                      </TD>
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
