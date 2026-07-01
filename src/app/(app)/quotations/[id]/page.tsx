import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "@/components/print-button";
import { DeleteButton } from "@/components/delete-button";
import { QuotationStatusControl } from "@/components/quotation-status-control";
import { quotationStatusLabel, quotationStatusTone } from "@/components/quotation-status-badge";
import { deleteQuotation } from "@/app/(app)/quotations/actions";
import { formatLKR, formatDate, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function QuotationViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [quotation, setting] = await Promise.all([
    prisma.quotation.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);

  if (!quotation) notFound();

  const businessName = setting?.businessName ?? "Madagama Pvt Ltd";
  const displayName = quotation.customer?.name ?? quotation.customerName ?? "—";
  const displayAddress = quotation.customer?.address ?? quotation.address ?? "";
  const displayPhone = quotation.customer?.phone ?? quotation.phone ?? "";

  async function onDelete() {
    "use server";
    return deleteQuotation(id);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/quotations">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={quotationStatusTone[quotation.status]}>{quotationStatusLabel[quotation.status]}</Badge>
          <Link href={`/quotations/${quotation.id}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </Link>
          <PrintButton label="Print Quotation" />
          <DeleteButton onDelete={onDelete} confirmText={`Delete quotation ${quotation.quotationNumber}? This cannot be undone.`} />
        </div>
      </div>

      {/* Status control — screen only */}
      <Card className="no-print mb-4">
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted">Status</p>
            <p className="text-xs text-faint">Track where this quotation stands.</p>
          </div>
          <div className="w-full max-w-[220px]">
            <QuotationStatusControl id={quotation.id} current={quotation.status} />
          </div>
        </CardContent>
      </Card>

      {/* A4 printable document */}
      <div className="print-area rounded-xl border border-border bg-surface p-8 shadow-sm">
        {/* Letterhead */}
        <div className="border-b-2 border-foreground/70 pb-4 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">{businessName}</h1>
          {setting?.address && <p className="mt-1 whitespace-pre-line text-sm text-muted">{setting.address}</p>}
          {setting?.phone && <p className="text-sm text-muted">Tel: {setting.phone}</p>}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-start justify-between gap-4 pt-5 text-sm">
          <div className="space-y-0.5">
            <p>
              <span className="text-muted">Date: </span>
              <span className="font-medium">{formatDate(quotation.createdAt)}</span>
            </p>
            {quotation.validUntil && (
              <p>
                <span className="text-muted">Valid until: </span>
                <span className="font-medium">{formatDate(quotation.validUntil)}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold tracking-wide">QUOTATION</h2>
            <p className="font-mono text-sm font-semibold">{quotation.quotationNumber}</p>
          </div>
        </div>

        {/* Greeting + customer */}
        <div className="pt-5 text-sm">
          <p className="font-medium">Dear Sir/Madam,</p>
          <p className="mt-1 text-muted">
            We are thankful to you for enquiring the items for which we have quoted our prices below.
          </p>
          <div className="mt-4 space-y-0.5">
            <p>
              <span className="text-muted">Customer Name: </span>
              <span className="font-medium">{displayName}</span>
            </p>
            {displayAddress && (
              <p>
                <span className="text-muted">Address: </span>
                <span className="whitespace-pre-line font-medium">{displayAddress}</span>
              </p>
            )}
            {displayPhone && (
              <p>
                <span className="text-muted">Phone: </span>
                <span className="font-medium">{displayPhone}</span>
              </p>
            )}
          </div>
        </div>

        {/* Items */}
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-foreground/40 text-left">
              <th className="w-14 py-2 pr-2 font-semibold">Qty</th>
              <th className="w-32 py-2 pr-2 font-semibold">Model</th>
              <th className="py-2 pr-2 font-semibold">Product Details</th>
              <th className="w-32 py-2 pl-2 text-right font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((it) => {
              const unit = toNum(it.unitPrice);
              return (
                <tr key={it.id} className="border-b border-border align-top">
                  <td className="py-2.5 pr-2">{it.qty}</td>
                  <td className="py-2.5 pr-2 font-medium">{it.model ?? ""}</td>
                  <td className="py-2.5 pr-2">
                    <div className="font-semibold">{it.name}</div>
                    {it.description && (
                      <div className="whitespace-pre-line text-[13px] text-muted">{it.description}</div>
                    )}
                    {it.qty > 1 && (
                      <div className="text-xs text-faint">
                        {it.qty} × {formatLKR(unit)} each
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pl-2 text-right font-medium">{formatLKR(it.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span>{formatLKR(quotation.subtotal)}</span>
            </div>
            {toNum(quotation.discount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Discount</span>
                <span>− {formatLKR(quotation.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-foreground/40 pt-2 text-base font-bold">
              <span>Total</span>
              <span>{formatLKR(quotation.grandTotal)}</span>
            </div>
          </div>
        </div>

        {quotation.notes && (
          <div className="mt-5 border-t border-border pt-3 text-sm">
            <p className="whitespace-pre-line text-muted">{quotation.notes}</p>
          </div>
        )}

        {/* Closing */}
        <div className="mt-6 space-y-4 text-sm">
          <p className="text-muted">
            We trust our offer meets with your approval and look forward to receiving your valued order. Please be
            kind enough to draw the cheque in favour of {businessName}.
          </p>
          <div>
            <p>Thanking you,</p>
            <p className="mt-6 font-semibold">Yours faithfully,</p>
            <p className="font-semibold">{businessName}</p>
            {setting?.phone && <p className="text-muted">Tel: {setting.phone}</p>}
            {quotation.createdBy?.name && (
              <p className="mt-1 text-xs text-faint">Prepared by {quotation.createdBy.name}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
