import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { computeOpenAccountState } from "@/lib/open-account";
import { orderSaleGroupInvoices, summarizeSaleGroup } from "@/lib/sale-group";
import { formatDateTime, formatLKR, round2, toNum } from "@/lib/utils";
import { formatWarrantyMonths } from "@/lib/warranty";
import { formatEnteredQuantity } from "@/lib/units";
import { InvoicePrintControls } from "@/components/invoice-print-controls";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function paymentMethodLabel(method: string): string {
  return {
    CASH: "Cash",
    BANK: "Bank transfer",
    CHEQUE: "Cheque",
    CARD: "Card",
    RETURN: "Return credit",
  }[method.toUpperCase()] ?? method;
}

export default async function SaleGroupReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [group, setting, ntEnabled] = await Promise.all([
    prisma.saleGroup.findUnique({
      where: { id },
      include: {
        invoices: {
          include: {
            customer: true,
            soldBy: { select: { name: true } },
            items: { include: { product: { select: { modelNumber: true } } } },
            openAccount: {
              include: {
                payments: {
                  orderBy: [{ paidDate: "asc" }, { createdAt: "asc" }],
                },
              },
            },
            _count: { select: { returns: true } },
          },
        },
      },
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
    nonTaxableEnabled(),
  ]);

  if (!group || group.invoices.length === 0) notFound();
  if (!ntEnabled && group.invoices.some((invoice) => invoice.taxCategory === "NON_TAXABLE")) {
    notFound();
  }

  const invoices = orderSaleGroupInvoices(group.invoices);
  const saleType = invoices[0]?.type;
  if (
    (saleType !== "CASH" && saleType !== "OPEN_ACCOUNT") ||
    invoices.some((invoice) => invoice.type !== saleType)
  ) {
    notFound();
  }

  const summary = summarizeSaleGroup(invoices);
  const first = invoices[0];
  const references = invoices.map((invoice) => invoice.invoiceNumber).join(" / ");
  const itemRows = invoices.flatMap((invoice) =>
    invoice.items.map((item) => ({ item, invoice })),
  );
  const hasReturns = invoices.some((invoice) => invoice._count.returns > 0);
  const notes = [...new Set(invoices.map((invoice) => invoice.notes?.trim()).filter(Boolean))] as string[];
  const accountRows = invoices.flatMap((invoice) => {
    if (!invoice.openAccount) return [];
    const state = computeOpenAccountState(
      toNum(invoice.openAccount.principal),
      invoice.openAccount.payments.map((payment) => ({
        amount: toNum(payment.amount),
        method: payment.method,
      })),
      invoice.openAccount.dueDate,
    );
    return [{ invoice, account: invoice.openAccount, state }];
  });
  const accountPrincipal = round2(accountRows.reduce((sum, row) => sum + row.state.principal, 0));
  const accountCredited = round2(accountRows.reduce((sum, row) => sum + row.state.credited, 0));
  const accountOutstanding = round2(accountRows.reduce((sum, row) => sum + row.state.outstanding, 0));
  const voidLabel =
    summary.voidStatus === "VOIDED"
      ? "VOIDED — AUDIT COPY ONLY"
      : summary.voidStatus === "PARTIALLY_VOIDED"
        ? "PARTIALLY VOIDED — AUDIT COPY"
        : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/invoices/${first.id}`}>
          <Button variant="outline"><ArrowLeft className="h-4 w-4" /> Back to bill</Button>
        </Link>
        <InvoicePrintControls label="Print full sale" />
      </div>

      {voidLabel && (
        <div className="no-print mb-4 flex items-center gap-2 border-l-4 border-danger bg-danger-soft px-4 py-3 font-bold text-danger-ink">
          <Ban className="h-5 w-5" /> {voidLabel}
        </div>
      )}

      <div className="print-area print-a4 rounded-xl border border-border bg-white p-8 text-slate-950 shadow-sm">
        {voidLabel && (
          <div className="mb-5 border-y-4 border-double border-danger py-2 text-center text-xl font-black tracking-[0.12em] text-danger">
            {voidLabel}
          </div>
        )}

        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-[26px] font-bold leading-tight">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1>
            {setting?.address && <p className="text-[16px] text-muted">{setting.address}</p>}
            {setting?.phone && <p className="text-[16px] text-muted">Tel: {setting.phone}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-[22px] font-semibold">
              {saleType === "OPEN_ACCOUNT" ? "PAY LATER SALE / ACCOUNT SUMMARY" : "SALES RECEIPT"}
            </h2>
            <p className="font-mono text-[13px] text-muted">Ref: {references}</p>
            <p className="text-[15px] text-muted">{formatDateTime(group.createdAt)}</p>
          </div>
        </header>

        <section className="flex flex-wrap justify-between gap-4 py-6 text-[16px]">
          <div>
            <p className="mb-1 font-medium text-muted">Bill To</p>
            <p className="font-medium">{first.customer?.name ?? "Walk-in Customer"}</p>
            {first.customer?.phone && <p className="text-muted">{first.customer.phone}</p>}
            {first.customer?.address && <p className="text-muted">{first.customer.address}</p>}
          </div>
          {first.soldBy?.name && (
            <div className="text-right">
              <p className="mb-1 font-medium text-muted">Served By</p>
              <p>{first.soldBy.name}</p>
            </div>
          )}
        </section>

        {hasReturns && (
          <p className="mb-3 border border-danger px-3 py-2 text-sm font-semibold text-danger">
            Return activity has been recorded for this sale.
          </p>
        )}
        <table className="w-full text-[15.5px]">
          <thead>
            <tr className="border-y border-border text-left text-muted">
              <th className="py-2 pr-2 font-medium">Code</th>
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="px-2 text-right font-medium">Qty</th>
              <th className="px-2 text-right font-medium">Unit price</th>
              <th className="py-2 pl-2 text-right font-medium">Net amount</th>
            </tr>
          </thead>
          <tbody>
            {itemRows.map(({ item, invoice }) => {
              const warrantyMonths = item.warrantyMonths ?? invoice.warrantyMonths;
              return (
                <tr key={item.id} className={`border-b border-border ${invoice.voidedAt ? "line-through" : ""}`}>
                  <td className="py-2 pr-2 font-mono text-[13px]">{item.codeSnapshot}</td>
                  <td className="py-2 pr-2">
                    <div>{item.nameSnapshot}{invoice.voidedAt ? " — VOIDED" : ""}</div>
                    {item.product?.modelNumber && <div className="text-[13px] text-muted">Model: {item.product.modelNumber}</div>}
                    {warrantyMonths !== null && <div className="text-[13px] font-medium">Warranty: {formatWarrantyMonths(warrantyMonths)}</div>}
                    {toNum(item.unitDiscount) > 0 && <div className="text-[13px] text-success">Less {formatLKR(item.unitDiscount)} per unit</div>}
                  </td>
                  <td className="px-2 text-right">{formatEnteredQuantity(toNum(item.qty), item.unit, item.enteredQty == null ? null : toNum(item.enteredQty), item.enteredUnit)}</td>
                  <td className="px-2 text-right">{formatLKR(item.unitPrice)}{item.unit === "METER" ? "/m" : ""}</td>
                  <td className="py-2 pl-2 text-right font-semibold">{formatLKR(item.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className="mt-7 flex justify-end">
          <div className="w-80 space-y-1.5 text-[16px]">
            <div className="flex justify-between"><span className="text-muted">Items subtotal</span><span>{formatLKR(summary.subtotal)}</span></div>
            {summary.productDiscount > 0 && <div className="flex justify-between"><span className="text-muted">Product discounts</span><span>− {formatLKR(summary.productDiscount)}</span></div>}
            {summary.billDiscount > 0 && <div className="flex justify-between"><span className="text-muted">Bill discount</span><span>− {formatLKR(summary.billDiscount)}</span></div>}
            <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-[20px] font-black">
              <span>Total</span><span>{formatLKR(summary.grandTotal)}</span>
            </div>
            {summary.voidStatus !== "ACTIVE" && (
              <div className="flex justify-between font-bold text-danger"><span>Still active</span><span>{formatLKR(summary.activeGrandTotal)}</span></div>
            )}
            {saleType === "CASH" && summary.voidStatus === "ACTIVE" && (
              <div className="flex justify-between font-semibold"><span>Paid</span><span>{formatLKR(summary.amountPaid)}</span></div>
            )}
          </div>
        </section>

        {saleType === "OPEN_ACCOUNT" && (
          <section className="mt-7 border border-amber-700/50 p-4">
            <h3 className="font-bold uppercase tracking-[0.08em]">Pay Later account summary</h3>
            <p className="mt-1 text-sm text-muted">No interest or guarantor. Payments remain attached to the internal bill shown below.</p>
            <table className="mt-3 w-full text-[14px]">
              <thead><tr className="border-y border-border text-left text-muted"><th className="py-2">Bill</th><th>Promised</th><th className="text-right">Original</th><th className="text-right">Paid / credited</th><th className="text-right">Outstanding</th></tr></thead>
              <tbody>
                {accountRows.map(({ invoice, account, state }) => (
                  <tr key={account.id} className="border-b border-border">
                    <td className="py-2 font-mono">{invoice.invoiceNumber}</td>
                    <td>{account.dueDate ? formatDateTime(account.dueDate) : "—"}</td>
                    <td className="text-right">{formatLKR(state.principal)}</td>
                    <td className="text-right">{formatLKR(state.credited)}</td>
                    <td className="text-right font-semibold">{formatLKR(state.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-slate-800 font-bold"><td className="pt-2" colSpan={2}>Total balance</td><td className="pt-2 text-right">{formatLKR(accountPrincipal)}</td><td className="pt-2 text-right">{formatLKR(accountCredited)}</td><td className="pt-2 text-right">{formatLKR(accountOutstanding)}</td></tr></tfoot>
            </table>
          </section>
        )}

        {notes.map((note) => <p key={note} className="mt-5 border-t border-border pt-3 text-[15px] text-muted">{note}</p>)}
        <p className="mt-8 text-center text-[15px] text-muted">Thank you for your business!</p>
      </div>

      <div className="print-area print-thermal mx-auto w-[302px] bg-white px-3 py-4 font-sans text-[14px] font-normal leading-[1.25] text-black shadow-sm">
        {voidLabel && <div className="mb-2 border-y-2 border-black py-1 text-center font-black">{voidLabel}</div>}
        <div className="text-center">
          <p className="text-[18px] font-semibold uppercase">{setting?.businessName ?? "Madagama Pvt Ltd"}</p>
          {setting?.address && <p>{setting.address}</p>}
          {setting?.phone && <p>Tel: {setting.phone}</p>}
          <p className="mt-2 font-bold">{saleType === "OPEN_ACCOUNT" ? "PAY LATER SALE" : "SALES RECEIPT"}</p>
          <p className="break-words font-mono text-[11px]">Ref: {references}</p>
          <p>{formatDateTime(group.createdAt)}</p>
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <p>Bill To: {first.customer?.name ?? "Walk-in Customer"}</p>
        {first.soldBy?.name && <p>Served By: {first.soldBy.name}</p>}

        {hasReturns && <p className="mt-2 border-y border-black py-1 text-center font-bold">RETURN ACTIVITY RECORDED</p>}
        <div className="mt-2 border-t border-black pt-1">
          {itemRows.map(({ item, invoice }) => {
            const warrantyMonths = item.warrantyMonths ?? invoice.warrantyMonths;
            return (
              <div key={item.id} className={`mt-1.5 ${invoice.voidedAt ? "line-through" : ""}`}>
                <p className="break-words">{item.nameSnapshot}{invoice.voidedAt ? " — VOIDED" : ""}</p>
                {item.product?.modelNumber && <p className="text-[12px]">Model: {item.product.modelNumber}</p>}
                {warrantyMonths !== null && <p className="text-[12px] font-semibold">Warranty: {formatWarrantyMonths(warrantyMonths)}</p>}
                <div className="flex justify-between gap-2"><span>{formatEnteredQuantity(toNum(item.qty), item.unit, item.enteredQty == null ? null : toNum(item.enteredQty), item.enteredUnit)} × {formatLKR(item.unitPrice)}{item.unit === "METER" ? "/m" : ""}</span><span>{formatLKR(item.lineTotal)}</span></div>
                {toNum(item.unitDiscount) > 0 && <p className="text-[12px]">Less {formatLKR(item.unitDiscount)} / unit</p>}
              </div>
            );
          })}
        </div>

        <div className="my-2 border-t border-dashed border-black" />
        <div className="flex justify-between"><span>Items subtotal</span><span>{formatLKR(summary.subtotal)}</span></div>
        {summary.productDiscount > 0 && <div className="flex justify-between"><span>Product discounts</span><span>− {formatLKR(summary.productDiscount)}</span></div>}
        {summary.billDiscount > 0 && <div className="flex justify-between"><span>Bill discount</span><span>− {formatLKR(summary.billDiscount)}</span></div>}
        <div className="mt-1 flex justify-between border-t-2 border-black pt-1 text-[16px] font-black"><span>TOTAL</span><span>{formatLKR(summary.grandTotal)}</span></div>
        {summary.voidStatus !== "ACTIVE" && <div className="flex justify-between font-black"><span>STILL ACTIVE</span><span>{formatLKR(summary.activeGrandTotal)}</span></div>}
        {saleType === "CASH" && summary.voidStatus === "ACTIVE" && <div className="flex justify-between font-semibold"><span>PAID</span><span>{formatLKR(summary.amountPaid)}</span></div>}

        {saleType === "OPEN_ACCOUNT" && (
          <section className="mt-2 border-y-2 border-black py-2">
            <p className="text-center font-bold">PAY LATER BALANCES</p>
            <p className="text-center text-[11.5px]">No interest or guarantor</p>
            {accountRows.map(({ invoice, account, state }) => (
              <div key={account.id} className="mt-1.5 border-b border-dotted border-black pb-1">
                <div className="flex justify-between font-semibold"><span>{invoice.invoiceNumber}</span><span>{formatLKR(state.outstanding)} due</span></div>
                <div className="flex justify-between text-[11.5px]"><span>Original {formatLKR(state.principal)}</span><span>Credited {formatLKR(state.credited)}</span></div>
                {account.dueDate && <p className="text-[11.5px]">Promised: {formatDateTime(account.dueDate)}</p>}
                {account.payments.length > 0 && <p className="text-[11.5px]">Latest: {paymentMethodLabel(account.payments.at(-1)!.method)} {formatLKR(account.payments.at(-1)!.amount)}</p>}
              </div>
            ))}
            <div className="mt-1 flex justify-between text-[16px] font-black"><span>TOTAL DUE</span><span>{formatLKR(accountOutstanding)}</span></div>
          </section>
        )}

        {notes.map((note) => <p key={note} className="mt-2 break-words">{note}</p>)}
        <div className="my-2 border-t border-dashed border-black" />
        <p className="text-center">Thank you for your business!</p>
      </div>
    </div>
  );
}
