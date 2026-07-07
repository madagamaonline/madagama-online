import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Undo2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { formatLKR, formatDateTime, toNum } from "@/lib/utils";
import { nonTaxableEnabled } from "@/lib/tax-mode";

const CATEGORY_LABEL = { TAXABLE: "TAXABLE", NON_TAXABLE: "NON-TAXABLE" } as const;

export const dynamic = "force-dynamic";

export default async function InvoiceViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const [invoice, setting, ntEnabled] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        soldBy: { select: { name: true } },
      },
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
    nonTaxableEnabled(),
  ]);

  // When non-taxable is off, a non-taxable invoice has no traces — even by URL.
  if (!invoice || (!ntEnabled && invoice.taxCategory === "NON_TAXABLE")) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/invoices">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex gap-2">
          <Link href={`/returns/new?invoice=${invoice.id}`}>
            <Button variant="outline">
              <Undo2 className="h-4 w-4" /> Return items
            </Button>
          </Link>
          <PrintButton label="Print Invoice" />
        </div>
      </div>

      {isNew && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5" /> Sale completed successfully.
        </div>
      )}

      <div className="print-area rounded-xl border border-border bg-surface p-8 shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-xl font-bold">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1>
            {setting?.address && <p className="text-sm text-muted">{setting.address}</p>}
            {setting?.phone && <p className="text-sm text-muted">Tel: {setting.phone}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-semibold">INVOICE</h2>
            <p className="text-sm font-medium">{invoice.invoiceNumber}</p>
            <p className="text-sm text-muted">{formatDateTime(invoice.createdAt)}</p>
            <div className="mt-1 flex justify-end gap-2">
              {ntEnabled && (
                <span className="no-print">
                  <Badge tone={invoice.taxCategory === "TAXABLE" ? "blue" : "gray"}>
                    {CATEGORY_LABEL[invoice.taxCategory]}
                  </Badge>
                </span>
              )}
              <Badge tone={invoice.type === "CREDIT" ? "amber" : "green"}>{invoice.type}</Badge>
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div className="flex flex-wrap justify-between gap-4 py-6 text-sm">
          <div>
            <p className="mb-1 font-medium text-muted">Bill To</p>
            <p className="font-medium">{invoice.customer?.name ?? "Walk-in Customer"}</p>
            {invoice.customer?.phone && <p className="text-muted">{invoice.customer.phone}</p>}
            {invoice.customer?.address && <p className="text-muted">{invoice.customer.address}</p>}
          </div>
          {invoice.soldBy?.name && (
            <div className="text-right">
              <p className="mb-1 font-medium text-muted">Served By</p>
              <p>{invoice.soldBy.name}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border text-left text-muted">
              <th className="py-2 pr-2 font-medium">Code</th>
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="px-2 text-right font-medium">Qty</th>
              <th className="px-2 text-right font-medium">Unit Price</th>
              <th className="py-2 pl-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it) => (
              <tr key={it.id} className="border-b border-border">
                <td className="py-2 pr-2 font-mono text-xs">{it.codeSnapshot}</td>
                <td className="py-2 pr-2">{it.nameSnapshot}</td>
                <td className="px-2 text-right">{it.qty}</td>
                <td className="px-2 text-right">{formatLKR(it.unitPrice)}</td>
                <td className="py-2 pl-2 text-right">{formatLKR(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span>{formatLKR(invoice.subtotal)}</span>
            </div>
            {toNum(invoice.discount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Discount</span>
                <span>− {formatLKR(invoice.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatLKR(invoice.grandTotal)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <p className="mt-6 border-t border-border pt-4 text-sm text-muted">{invoice.notes}</p>
        )}
        <p className="mt-8 text-center text-xs text-muted">Thank you for your business!</p>
      </div>
    </div>
  );
}
