import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Phone, MapPin, CreditCard, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { computeCreditState } from "@/lib/credit";
import { formatLKR, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      creditAgreements: {
        orderBy: { createdAt: "desc" },
        include: { invoice: { select: { invoiceNumber: true } }, payments: true },
      },
    },
  });
  if (!customer) notFound();

  const agreements = customer.creditAgreements.map((a) => {
    const state = computeCreditState(
      {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      },
      a.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate })),
    );
    return { a, state };
  });

  const nics = [
    { key: customer.nicFrontKey, label: "NIC Front" },
    { key: customer.nicBackKey, label: "NIC Back" },
  ].filter((n) => n.key);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={customer.name}
        subtitle="Customer details"
        action={
          <div className="flex gap-2">
            <Link href={`/customers/${customer.id}/statement`}>
              <Button variant="outline">
                <FileText className="h-4 w-4" /> Statement
              </Button>
            </Link>
            <Link href={`/customers/${customer.id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted" /> {customer.phone}
            </p>
            {customer.nic && <p className="text-muted">NIC: {customer.nic}</p>}
            {customer.email && <p className="text-muted">{customer.email}</p>}
            {customer.address && (
              <p className="flex items-start gap-2 text-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {customer.address}
              </p>
            )}
            {nics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {nics.map((n) => (
                  <a
                    key={n.key}
                    href={`/api/files/${n.key}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${n.key}`} alt={n.label} className="h-24 w-full object-cover" />
                    <span className="block bg-input px-2 py-1 text-center text-xs text-muted">{n.label}</span>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Credit Agreements</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {agreements.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">
                <CreditCard className="mx-auto mb-2 h-7 w-7 opacity-40" />
                No credit agreements.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Invoice</TH>
                    <TH className="text-right">Principal</TH>
                    <TH className="text-right">Outstanding</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {agreements.map(({ a, state }) => (
                    <TR key={a.id}>
                      <TD className="font-medium">
                        <Link href={`/credit/${a.id}`} className="text-primary hover:underline">
                          {a.invoice.invoiceNumber}
                        </Link>
                      </TD>
                      <TD className="text-right">{formatLKR(state.principal)}</TD>
                      <TD className="text-right font-medium">{formatLKR(state.outstanding)}</TD>
                      <TD>
                        {state.isSettled ? (
                          <Badge tone="green">Settled</Badge>
                        ) : state.isOverdue ? (
                          <Badge tone="red">Overdue</Badge>
                        ) : (
                          <Badge tone="amber">In grace</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
