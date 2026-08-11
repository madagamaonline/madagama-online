import Link from "next/link";
import { Plus, Download } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ListSearch } from "@/components/list-search";
import { contains, parseSearchQuery, tokenMatchWhere } from "@/lib/search";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
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
  // Shared with /api/customers/search, so the list and the POS picker agree on
  // what a query means — notably phone numbers typed with spaces or dashes.
  const parsed = parseSearchQuery(query);
  const intent: Prisma.CustomerWhereInput[] = [];
  if (parsed.phone) intent.push({ phone: parsed.phone });
  if (parsed.nic) intent.push({ nic: contains(parsed.nic) });
  const tokens = tokenMatchWhere<Prisma.CustomerWhereInput>(parsed.tokens, (token) => {
    const digits = token.replace(/\D/g, "");
    const fields: Prisma.CustomerWhereInput[] = [{ name: contains(token) }, { nic: contains(token) }];
    if (digits) fields.push({ phone: contains(digits) });
    return fields;
  });
  const where: Prisma.CustomerWhereInput = parsed.isEmpty
    ? {}
    : { OR: [...intent, ...(tokens ? [tokens] : [])] };

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { creditAgreements: { where: { status: { not: "VOIDED" }, invoice: { voidedAt: null } } } } } },
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
            <ListSearch placeholder="Search name, phone or NIC…" />
          </div>
          {customers.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query ? "No customers match." : "No customers yet."}
            </div>
          ) : (
            <>
              <div className="md:hidden">
                {customers.map((c) => (
                  <div key={c.id} className="border-b border-border-subtle p-4 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">
                          {c.name}
                        </Link>
                        <div className="mt-0.5 text-sm">{c.phone}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          {c.nic ? `NIC ${c.nic} · ` : ""}
                          Added {formatDate(c.createdAt)}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted">
                        {c._count.creditAgreements} credit
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
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
