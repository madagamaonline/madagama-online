import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, Undo2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoicePrintControls } from "@/components/invoice-print-controls";
import { formatLKR, formatDateTime, toNum } from "@/lib/utils";
import { returnMethodLabel } from "@/lib/returns";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { getSession } from "@/lib/auth";
import { VoidInvoiceButton } from "@/components/void-invoice-button";

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

  const [invoice, setting, ntEnabled, session] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { modelNumber: true } } } },
        customer: true,
        soldBy: { select: { name: true } },
        voidedBy: { select: { name: true } },
        returns: {
          orderBy: { createdAt: "asc" },
          include: {
            items: { include: { product: { select: { name: true, code: true } } } },
            createdBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
    nonTaxableEnabled(),
    getSession(),
  ]);

  // When non-taxable is off, a non-taxable invoice has no traces — even by URL.
  if (!invoice || (!ntEnabled && invoice.taxCategory === "NON_TAXABLE")) notFound();

  const soldQty = invoice.items.reduce((s, it) => s + it.qty, 0);
  const returnedQty = invoice.returns.reduce((s, r) => s + r.items.reduce((a, it) => a + it.qty, 0), 0);
  const totalRefunded = invoice.returns.reduce((s, r) => s + toNum(r.totalRefund), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/invoices">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {!invoice.voidedAt && (
            <>
              <Link href={`/returns/new?invoice=${invoice.id}`}><Button variant="outline"><Undo2 className="h-4 w-4" /> Return items</Button></Link>
              {session?.role === "ADMIN" && <VoidInvoiceButton invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />}
            </>
          )}
          <div className="w-full sm:w-auto"><InvoicePrintControls /></div>
        </div>
      </div>

      {isNew && !invoice.voidedAt && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5" /> Sale completed successfully.
        </div>
      )}

      {invoice.voidedAt && (
        <div className="no-print mb-4 border-l-4 border-danger bg-danger-soft px-4 py-4 text-danger-ink" role="status">
          <div className="flex items-center gap-2 font-bold"><Ban className="h-5 w-5" /> VOIDED — not a valid sale</div>
          <p className="mt-1 text-sm">{invoice.voidReason}</p>
          <p className="mt-1 text-xs">Voided {formatDateTime(invoice.voidedAt)}{invoice.voidedBy?.name ? ` by ${invoice.voidedBy.name}` : ""}</p>
        </div>
      )}

      {/* A4 layout */}
      <div className="print-area print-a4 rounded-xl border border-border bg-surface p-8 shadow-sm">
        {invoice.voidedAt && <div className="mb-5 border-y-4 border-double border-danger py-2 text-center text-2xl font-black tracking-[0.2em] text-danger">VOIDED</div>}
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-[22px] font-bold">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1>
            {setting?.address && <p className="text-[15px] text-muted">{setting.address}</p>}
            {setting?.phone && <p className="text-[15px] text-muted">Tel: {setting.phone}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-xl font-semibold">INVOICE</h2>
            <p className="text-[15px] font-medium">{invoice.invoiceNumber}</p>
            <p className="text-[15px] text-muted">{formatDateTime(invoice.createdAt)}</p>
            <div className="mt-1 flex justify-end gap-2">
              {ntEnabled && (
                <span className="no-print">
                  <Badge tone={invoice.taxCategory === "TAXABLE" ? "blue" : "gray"}>
                    {CATEGORY_LABEL[invoice.taxCategory]}
                  </Badge>
                </span>
              )}
              <Badge tone={invoice.type === "CREDIT" ? "amber" : "green"}>{invoice.type}</Badge>
              {invoice.voidedAt && <Badge tone="red">VOIDED</Badge>}
              {returnedQty > 0 && (
                <span className="no-print">
                  <Badge tone="red">{returnedQty >= soldQty ? "RETURNED" : "PARTIALLY RETURNED"}</Badge>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div className="flex flex-wrap justify-between gap-4 py-6 text-[15px]">
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
        <table className="w-full text-[15px]">
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
                <td className="py-2 pr-2 font-mono text-[13px]">{it.codeSnapshot}</td>
                <td className="py-2 pr-2">
                  <div>{it.nameSnapshot}</div>
                  {it.product?.modelNumber && (
                    <div className="text-[13px] text-muted">Model: {it.product.modelNumber}</div>
                  )}
                </td>
                <td className="px-2 text-right">{it.qty}</td>
                <td className="px-2 text-right">{formatLKR(it.unitPrice)}</td>
                <td className="py-2 pl-2 text-right">{formatLKR(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-1.5 text-[15px]">
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
            <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
              <span>Total</span>
              <span>{formatLKR(invoice.grandTotal)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <p className="mt-6 border-t border-border pt-4 text-[15px] text-muted">{invoice.notes}</p>
        )}
        <p className="mt-8 text-center text-sm text-muted">Thank you for your business!</p>
      </div>

      {/* 80mm thermal receipt layout (hidden unless "80mm" is selected) */}
      <div className="print-area print-thermal mx-auto w-[302px] bg-white px-3 py-4 font-sans text-[12px] font-normal leading-tight text-black shadow-sm">
        {invoice.voidedAt && <div className="mb-2 border-y-2 border-black py-1 text-center text-base font-black tracking-[0.15em]">VOIDED</div>}
        <div className="text-center">
          <p className="text-[15px] font-semibold uppercase">{setting?.businessName ?? "Madagama Pvt Ltd"}</p>
          {setting?.address && <p>{setting.address}</p>}
          {setting?.phone && <p>Tel: {setting.phone}</p>}
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        <div className="flex justify-between">
          <span>INVOICE</span>
          <span className="font-medium">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>{formatDateTime(invoice.createdAt)}</span>
          <span>{invoice.type}</span>
        </div>
        <p className="mt-1">Bill To: {invoice.customer?.name ?? "Walk-in Customer"}</p>
        {invoice.soldBy?.name && <p>Served By: {invoice.soldBy.name}</p>}

        <div className="my-2 border-t border-dashed border-black" />

        {invoice.items.map((it) => (
          <div key={it.id} className="mb-1.5">
            <p className="break-words">{it.nameSnapshot}</p>
            {it.product?.modelNumber && (
              <p className="break-words text-[11px]">Model: {it.product.modelNumber}</p>
            )}
            <div className="flex justify-between">
              <span>
                {it.qty} × {formatLKR(it.unitPrice)}
              </span>
              <span>{formatLKR(it.lineTotal)}</span>
            </div>
          </div>
        ))}

        <div className="my-2 border-t border-dashed border-black" />

        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatLKR(invoice.subtotal)}</span>
        </div>
        {toNum(invoice.discount) > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>− {formatLKR(invoice.discount)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-[13px] font-semibold">
          <span>TOTAL</span>
          <span>{formatLKR(invoice.grandTotal)}</span>
        </div>

        {invoice.notes && <p className="mt-2 break-words">{invoice.notes}</p>}

        <div className="my-2 border-t border-dashed border-black" />

        <p className="text-center">Thank you for your business!</p>
        {invoice.voidedAt && <p className="mt-2 border-t border-dashed border-black pt-2 text-center font-bold">VOIDED — NOT A VALID SALE</p>}
      </div>

      {invoice.returns.length > 0 && (
        <div className="no-print mt-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Undo2 className="h-4 w-4 text-danger" /> Returns against this invoice
            </h3>
            <span className="text-sm text-muted">
              Total refunded: <span className="font-semibold text-foreground">{formatLKR(totalRefunded)}</span>
            </span>
          </div>
          <div className="divide-y divide-border">
            {invoice.returns.map((r) => (
              <div key={r.id} className="py-3 text-sm first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">
                    {formatDateTime(r.createdAt)} · {returnMethodLabel(r.method)}
                    {r.createdBy?.name ? ` · by ${r.createdBy.name}` : ""}
                  </span>
                  <span className="font-medium">{formatLKR(r.totalRefund)}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {r.items.map((it) => (
                    <li key={it.id} className="text-muted">
                      {it.qty} × {it.product.name}{" "}
                      <span className="font-mono text-xs">({it.product.code})</span> @ {formatLKR(it.unitPrice)}
                    </li>
                  ))}
                </ul>
                {r.reason && <p className="mt-1 text-xs text-muted">Reason: {r.reason}</p>}
              </div>
            ))}
          </div>
          <Link href="/returns" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
            View all returns →
          </Link>
        </div>
      )}
    </div>
  );
}
