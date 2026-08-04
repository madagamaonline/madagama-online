import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListSearch } from "@/components/list-search";
import { Highlight } from "@/components/highlight";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, toNum } from "@/lib/utils";
import { nonTaxableEnabled, purchaseTaxableWhere } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const ntEnabled = await nonTaxableEnabled();
  const where: Prisma.SupplierWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { contactPerson: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      purchases: {
        where: purchaseTaxableWhere(ntEnabled),
        select: { total: true, amountPaid: true },
      },
    },
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
          <div className="border-b border-border p-4">
            <ListSearch
              placeholder="Search name, contact, phone or email…"
              className="relative max-w-md"
            />
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query ? "No suppliers match." : "No suppliers yet."}
            </div>
          ) : (
            <>
              <div className="md:hidden">
                {rows.map(({ s, payable, count }) => (
                  <div key={s.id} className="border-b border-border-subtle p-4 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/suppliers/${s.id}`} className="font-medium text-primary hover:underline">
                          <Highlight text={s.name} query={query} />
                        </Link>
                        <div className="mt-0.5 text-xs text-muted">
                          {s.contactPerson && (
                            <>
                              <Highlight text={s.contactPerson} query={query} /> ·{" "}
                            </>
                          )}
                          {s.phone ? <Highlight text={s.phone} query={query} /> : "No phone"}
                        </div>
                      </div>
                      <Link
                        href={`/suppliers/${s.id}/edit`}
                        className="shrink-0 text-muted hover:text-primary"
                        aria-label={`Edit ${s.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="font-medium">{formatLKR(payable)} payable</span>
                      <span className="text-muted">
                        {count} purchase{count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
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
                            <Highlight text={s.name} query={query} />
                          </Link>
                        </TD>
                        <TD className="text-muted">
                          {s.contactPerson ? <Highlight text={s.contactPerson} query={query} /> : "—"}
                        </TD>
                        <TD>{s.phone ? <Highlight text={s.phone} query={query} /> : "—"}</TD>
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
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
