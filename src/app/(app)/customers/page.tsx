import Link from "next/link";
import { Plus, Search, Download } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const where: Prisma.CustomerWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { nic: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { creditAgreements: true } } },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Customer records and credit history"
        action={
          <div className="flex gap-2">
            <a href="/api/export/customers" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> Export
            </a>
            <Link href="/customers/new">
              <Button>
                <Plus className="h-4 w-4" /> New Customer
              </Button>
            </Link>
          </div>
        }
      />
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <form className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input name="q" defaultValue={query} placeholder="Search name, phone or NIC…" className="pl-9" />
            </form>
          </div>
          {customers.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query ? "No customers match." : "No customers yet."}
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Phone</TH>
                  <TH>NIC</TH>
                  <TH>Credit agreements</TH>
                  <TH>Added</TH>
                </TR>
              </THead>
              <TBody>
                {customers.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">
                      <Link href={`/customers/${c.id}`} className="text-primary hover:underline">
                        {c.name}
                      </Link>
                    </TD>
                    <TD>{c.phone}</TD>
                    <TD className="text-muted">{c.nic ?? "—"}</TD>
                    <TD>{c._count.creditAgreements}</TD>
                    <TD className="text-muted">{formatDate(c.createdAt)}</TD>
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
