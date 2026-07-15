import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, MoveHorizontal, ReceiptText, Undo2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoicePrintControls } from "@/components/invoice-print-controls";
import { formatLKR, formatDateTime, toNum } from "@/lib/utils";
import { returnMethodLabel } from "@/lib/returns";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { getSession } from "@/lib/auth";
import { VoidInvoiceButton } from "@/components/void-invoice-button";
import { buildCreditPaymentLedger, computeCreditState } from "@/lib/credit";

const CATEGORY_LABEL = { TAXABLE: "TAXABLE", NON_TAXABLE: "NON-TAXABLE" } as const;

function paymentMethodLabel(method: string): string {
  return {
    CASH: "Cash",
    BANK: "Bank transfer",
    CHEQUE: "Cheque",
    CARD: "Card",
  }[method.toUpperCase()] ?? method;
}

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
        creditAgreement: {
          include: {
            payments: {
              orderBy: [{ paidDate: "asc" }, { createdAt: "asc" }],
              include: { recordedBy: { select: { name: true } } },
            },
          },
        },
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
  const statementAsOf = new Date();
  const creditAgreement = invoice.type === "CREDIT" ? invoice.creditAgreement : null;
  const creditTerms = creditAgreement
    ? {
        principal: toNum(creditAgreement.principal),
        startDate: creditAgreement.startDate,
        interestRatePerMonth: toNum(creditAgreement.interestRatePerMonth),
        interestFreeMonths: creditAgreement.interestFreeMonths,
      }
    : null;
  const creditPayments = creditAgreement?.payments.map((payment) => ({
    amount: toNum(payment.amount),
    paidDate: payment.paidDate,
  })) ?? [];
  const creditState = creditTerms
    ? computeCreditState(creditTerms, creditPayments, statementAsOf)
    : null;
  const paymentBalances = creditTerms
    ? buildCreditPaymentLedger(creditTerms, creditPayments)
    : [];
  const creditLedger = creditAgreement?.payments.map((payment, index) => ({
    ...payment,
    amountNumber: toNum(payment.amount),
    balanceAfter: paymentBalances[index]?.balanceAfter ?? 0,
  })) ?? [];
  const creditVoided = Boolean(invoice.voidedAt) || creditAgreement?.status === "VOIDED";
  const creditStatus = creditVoided
    ? "VOIDED — AUDIT COPY ONLY"
    : creditState?.isSettled
      ? "PAID IN FULL — SETTLED"
      : creditState?.isOverdue
        ? "OVERDUE"
        : "ACTIVE — WITHIN INTEREST-FREE PERIOD";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={invoice.type === "CREDIT" ? "/credit-invoices" : "/invoices"}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {creditAgreement && (
            <Link href={`/credit/${creditAgreement.id}`}>
              <Button variant="outline"><ReceiptText className="h-4 w-4" /> Record / view payments</Button>
            </Link>
          )}
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

      {/* A4 layout. Credit statements retain a paper-sized canvas on screen;
          the viewport scrolls it instead of allowing financial columns to clip. */}
      {creditAgreement && (
        <div className="no-print mb-2 flex items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary sm:hidden">
          <MoveHorizontal className="h-4 w-4 shrink-0" /> Swipe horizontally to review the full A4 statement
        </div>
      )}
      <div className={creditAgreement ? "a4-preview-viewport max-w-full overflow-x-auto pb-2" : undefined}>
      <div className={`print-area print-a4 rounded-xl border border-border p-8 shadow-sm ${creditAgreement ? "credit-print-a4 w-[720px] min-w-[720px] bg-white text-slate-950 sm:w-full" : "bg-surface"}`}>
        {invoice.voidedAt && <div className="mb-5 border-y-4 border-double border-danger py-2 text-center text-2xl font-black tracking-[0.2em] text-danger">VOIDED</div>}
        {/* Header */}
        <div className="invoice-print-header flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-[22px] font-bold">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1>
            {setting?.address && <p className="text-[15px] text-muted">{setting.address}</p>}
            {setting?.phone && <p className="text-[15px] text-muted">Tel: {setting.phone}</p>}
          </div>
          <div className="text-right">
            <h2 className="max-w-[280px] text-xl font-semibold">
              {creditAgreement ? "CREDIT INVOICE / ACCOUNT STATEMENT" : "INVOICE"}
            </h2>
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
        <div className="invoice-bill-to flex flex-wrap justify-between gap-4 py-6 text-[15px]">
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
        <table className="invoice-items w-full text-[15px]">
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
        <div className="invoice-totals mt-6 flex justify-end">
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

        {creditAgreement && creditState && (
          <section className="credit-statement mt-7 border border-slate-400 bg-white p-4 pt-4 text-[14px] text-slate-950">
            <div className="credit-summary avoid-print-break border border-slate-400">
              <div className="credit-print-tint flex flex-wrap items-start justify-between gap-3 border-b border-slate-400 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-[15px] font-bold uppercase tracking-[0.08em] text-slate-900">Credit account summary</h3>
                  <p className="mt-0.5 text-[12px] text-slate-600">As of {formatDateTime(statementAsOf)}</p>
                </div>
                <div className={`border-2 px-3 py-1 text-right text-[12px] font-black tracking-[0.06em] ${creditVoided ? "border-red-700 text-red-800" : creditState.isSettled ? "border-green-800 text-green-900" : creditState.isOverdue ? "border-red-700 text-red-800" : "border-amber-700 text-amber-900"}`}>
                  {creditStatus}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="space-y-1.5 px-4 py-3 sm:border-r sm:border-slate-300">
                  <div className="flex justify-between gap-4"><span className="text-slate-600">Original invoice total</span><span className="tabular font-medium">{formatLKR(creditState.principal)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-600">Payments received</span><span className="tabular font-medium">− {formatLKR(creditState.totalPaid)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-600">Principal remaining</span><span className="tabular font-medium">{formatLKR(creditState.principalRemaining)}</span></div>
                </div>
                <div className="space-y-1.5 border-t border-slate-300 px-4 py-3 sm:border-t-0">
                  <div className="flex justify-between gap-4"><span className="text-slate-600">Interest charged to date</span><span className="tabular font-medium">{formatLKR(creditState.interestAccrued)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-600">Unpaid interest</span><span className="tabular font-medium">{formatLKR(creditState.interestOutstanding)}</span></div>
                  <div className="mt-2 flex justify-between gap-4 border-t-2 border-slate-800 pt-2 text-[17px] font-black"><span>Balance due</span><span className="tabular">{formatLKR(creditState.outstanding)}</span></div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-end justify-between gap-3">
                <h3 className="text-[15px] font-bold uppercase tracking-[0.08em] text-slate-900">Payment history</h3>
                <span className="text-[11px] text-slate-500">Payments reduce interest first, then principal</span>
              </div>
              <table className="credit-payment-history w-full border-collapse text-[12px]">
                <thead>
                    <tr className="credit-print-tint border-y-2 border-slate-700 bg-slate-50 text-left">
                    <th className="px-2 py-2 font-bold">Date</th>
                    <th className="px-2 py-2 font-bold">Method</th>
                    <th className="px-2 py-2 font-bold">Reference / note</th>
                    <th className="px-2 py-2 text-right font-bold">Payment</th>
                    <th className="px-2 py-2 text-right font-bold">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {creditLedger.length === 0 ? (
                    <tr className="border-b border-slate-400">
                      <td colSpan={3} className="px-2 py-4 italic text-slate-600">No payments received</td>
                      <td className="px-2 py-4 text-right tabular">—</td>
                      <td className="px-2 py-4 text-right tabular font-bold">{formatLKR(creditState.outstanding)}</td>
                    </tr>
                  ) : creditLedger.map((payment) => (
                    <tr key={payment.id} className="border-b border-slate-300">
                      <td className="whitespace-nowrap px-2 py-2.5">{formatDateTime(payment.paidDate)}</td>
                      <td className="px-2 py-2.5">{paymentMethodLabel(payment.method)}</td>
                      <td className="px-2 py-2.5 text-slate-600">
                        <span className="block text-slate-800">{payment.note ?? "—"}</span>
                        {payment.recordedBy?.name && (
                          <span className="mt-0.5 block text-[10px] text-slate-500">Recorded by {payment.recordedBy.name}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular font-medium">{formatLKR(payment.amountNumber)}</td>
                      <td className="px-2 py-2.5 text-right tabular font-bold">{formatLKR(payment.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {creditVoided && (
              <p className="avoid-print-break mt-5 border-2 border-slate-800 p-3 text-center font-black uppercase tracking-[0.12em]">
                Voided — audit copy only — not a valid demand for payment
              </p>
            )}
          </section>
        )}

        {invoice.notes && (
          <p className="invoice-notes mt-6 border-t border-border pt-4 text-[15px] text-muted">{invoice.notes}</p>
        )}
        <p className="invoice-footer mt-8 text-center text-sm text-muted">Thank you for your business!</p>
      </div>
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
          <span>{creditAgreement ? "CREDIT STATEMENT" : "INVOICE"}</span>
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

        {creditAgreement && creditState && (
          <section className="mt-2 border-y-2 border-black py-2">
            <div className="text-center font-bold">CREDIT ACCOUNT — {creditStatus}</div>
            <div className="mt-1 text-[10px] text-center">As of {formatDateTime(statementAsOf)}</div>
            <div className="mt-2 flex justify-between"><span>Original total</span><span className="tabular">{formatLKR(creditState.principal)}</span></div>
            <div className="flex justify-between"><span>Payments</span><span className="tabular">− {formatLKR(creditState.totalPaid)}</span></div>
            <div className="flex justify-between"><span>Principal left</span><span className="tabular">{formatLKR(creditState.principalRemaining)}</span></div>
            <div className="flex justify-between"><span>Interest charged</span><span className="tabular">{formatLKR(creditState.interestAccrued)}</span></div>
            <div className="flex justify-between"><span>Interest unpaid</span><span className="tabular">{formatLKR(creditState.interestOutstanding)}</span></div>
            <div className="mt-1 flex justify-between border-t-2 border-black pt-1 text-[14px] font-black"><span>BALANCE DUE</span><span className="tabular">{formatLKR(creditState.outstanding)}</span></div>

            <div className="my-2 border-t border-dashed border-black" />
            <p className="font-bold">PAYMENT HISTORY</p>
            {creditLedger.length === 0 ? (
              <div className="mt-1 flex justify-between italic"><span>No payments received</span><span className="tabular">Bal {formatLKR(creditState.outstanding)}</span></div>
            ) : creditLedger.map((payment) => (
              <div key={payment.id} className="mt-1.5 border-b border-dotted border-black pb-1">
                <div className="flex justify-between gap-2">
                  <span>{formatDateTime(payment.paidDate)} · {paymentMethodLabel(payment.method)}</span>
                  <span className="tabular font-semibold">{formatLKR(payment.amountNumber)}</span>
                </div>
                <div className="flex justify-between gap-2 text-[10px]">
                  <span className="min-w-0 break-words">{payment.note ?? "Payment"}</span>
                  <span className="shrink-0 tabular font-semibold">Bal {formatLKR(payment.balanceAfter)}</span>
                </div>
              </div>
            ))}
            {creditVoided && <p className="mt-2 border-2 border-black p-1 text-center font-black">AUDIT COPY ONLY — VOIDED</p>}
          </section>
        )}

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
