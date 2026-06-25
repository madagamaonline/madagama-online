import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { purchases: { select: { total: true, amountPaid: true } } },
  });

  const rows = suppliers.map((s) => {
    const payable = s.purchases.reduce(
      (sum, p) => sum + Math.max(0, toNum(p.total) - toNum(p.amountPaid)),
      0,
    );
    return { s, payable, count: s.purchases.length };
  });

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Suppliers and amounts payable"
        action={
          <Link href="/suppliers/new">
            <Button>
              <Plus className="h-4 w-4" /> New Supplier
            </Button>
          </Link>
        }
      />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">No suppliers yet.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Contact</TH>
                  <TH>Phone</TH>
                  <TH className="text-right">Purchases</TH>
                  <TH className="text-right">Payable</TH>
                  <TH className="text-right">Edit</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map(({ s, payable, count }) => (
                  <TR key={s.id}>
                    <TD className="font-medium">
                      <Link href={`/suppliers/${s.id}`} className="text-primary hover:underline">
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="text-muted">{s.contactPerson ?? "—"}</TD>
                    <TD>{s.phone ?? "—"}</TD>
                    <TD className="text-right">{count}</TD>
                    <TD className="text-right font-medium">{formatLKR(payable)}</TD>
                    <TD className="text-right">
                      <Link
                        href={`/suppliers/${s.id}/edit`}
                        className="inline-flex items-center justify-end text-muted hover:text-primary"
                        aria-label={`Edit ${s.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </TD>
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
