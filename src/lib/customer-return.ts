import "server-only";
import type { Prisma } from "@prisma/client";
import { customerReturnAllowances, returnLineValue } from "@/lib/return-values";
import { logStockMovement } from "@/lib/stock";
import { restoreInvoiceItemToBatches } from "@/lib/stock-batches";
import { computeCreditState } from "@/lib/credit";
import { round2, toNum } from "@/lib/utils";
import { computeOpenAccountState, openAccountInvoiceStatus } from "@/lib/open-account";

/** A message that is safe to show the cashier as-is. */
export class ReturnValidationError extends Error {}

export type CustomerReturnLine = {
  productId: string;
  qty: number;
  /** False when the item came back damaged and must not go back on the shelf. */
  restock?: boolean;
};

export type AppliedCustomerReturn = {
  id: string;
  totalRefund: number;
  /** Value settled outside the customer's account: handed over as cash, or for
   *  an exchange, applied as credit to the new checkout. */
  cashRefund: number;
  creditedToBalance: number;
};

/**
 * Record a customer return inside the caller's transaction: values each line
 * from what the customer actually paid, credits any open credit / Pay Later
 * balance first, restocks undamaged goods and writes the stock trail.
 *
 * With `exchangeSaleGroupId`, the cash portion is not handed out — it is the
 * credit applied to that new checkout. It is still stored as `cashRefund`, so
 * the drawer nets the new cash sale against it and only the difference moves.
 */
export async function applyCustomerReturn(
  tx: Prisma.TransactionClient,
  d: {
    invoiceId: string;
    method?: string | null;
    reason?: string | null;
    lines: CustomerReturnLine[];
    userId: string | null;
    exchangeSaleGroupId?: string | null;
  },
): Promise<AppliedCustomerReturn> {
  const invoice = await tx.invoice.findUnique({
    where: { id: d.invoiceId },
    select: {
      voidedAt: true,
      grandTotal: true,
      items: {
        select: {
          id: true,
          productId: true,
          qty: true,
          unitPrice: true,
          unitDiscount: true,
          costSnapshot: true,
          unit: true,
        },
      },
      returns: {
        select: { totalRefund: true, items: { select: { productId: true, qty: true, lineTotal: true } } },
      },
    },
  });
  if (!invoice) throw new ReturnValidationError("Invoice not found.");
  if (invoice.voidedAt) throw new ReturnValidationError("A voided invoice cannot receive returns.");

  let returnLines;
  try {
    const remaining = customerReturnAllowances(
      toNum(invoice.grandTotal),
      invoice.items.map((item) => ({ ...item, qty: toNum(item.qty), unitPrice: toNum(item.unitPrice), unitDiscount: toNum(item.unitDiscount) })),
      invoice.returns.map((ret) => ({ totalRefund: toNum(ret.totalRefund), items: ret.items.map((item) => ({ ...item, qty: toNum(item.qty), lineTotal: toNum(item.lineTotal) })) })),
    );
    returnLines = d.lines.map((line) => {
      const allowed = remaining.get(line.productId);
      if (!allowed || allowed.qty <= 0) throw new Error("One of the selected products is not returnable on this invoice.");
      const lineTotal = returnLineValue(allowed, line.qty);
      return { ...line, restock: line.restock !== false, unitPrice: round2(lineTotal / line.qty), lineTotal };
    });
  } catch (error) {
    throw new ReturnValidationError(error instanceof Error ? error.message : "Invalid return quantity.");
  }
  const total = round2(returnLines.reduce((sum, line) => sum + line.lineTotal, 0));

  // If the invoice is a credit sale with an unsettled agreement, the
  // refund is applied to the customer's outstanding balance (capped at
  // what they still owe) instead of being handed out as cash. It goes
  // through the same Payment pipeline as a normal instalment so the
  // interest-first allocation, invoice status, and settlement logic all
  // stay authoritative.
  let creditedToBalance = 0;
  const returnDate = new Date();
  const agreement = await tx.creditAgreement.findUnique({
    where: { invoiceId: d.invoiceId },
    include: { payments: true },
  });
  const openAgreement = agreement && agreement.status !== "SETTLED" && agreement.status !== "VOIDED" ? agreement : null;
  const openAccount = await tx.openAccount.findUnique({ where: { invoiceId: d.invoiceId }, include: { payments: true } });
  const activeOpenAccount = openAccount && openAccount.status === "ACTIVE" ? openAccount : null;
  const openState = activeOpenAccount ? computeOpenAccountState(toNum(activeOpenAccount.principal), activeOpenAccount.payments.map((p) => ({ amount: toNum(p.amount), method: p.method }))) : null;
  const creditState = openAgreement ? computeCreditState({
    principal: toNum(openAgreement.principal), startDate: openAgreement.startDate,
    interestRatePerMonth: toNum(openAgreement.interestRatePerMonth), interestFreeMonths: openAgreement.interestFreeMonths,
  }, openAgreement.payments.map((p) => ({ amount: toNum(p.amount), discount: toNum(p.discount), paidDate: p.paidDate })), returnDate) : null;
  const outstanding = creditState?.outstanding ?? openState?.outstanding ?? 0;
  creditedToBalance = round2(Math.min(outstanding, total));
  const isExchange = Boolean(d.exchangeSaleGroupId);
  const cashRefund = isExchange || openAgreement || activeOpenAccount || !d.method || d.method === "CASH"
    ? round2(total - creditedToBalance) : 0;
  const method = isExchange
    ? "EXCHANGE"
    : creditedToBalance > 0
      ? (cashRefund > 0 ? "MIXED" : "CREDIT_BALANCE") : (openAgreement || activeOpenAccount ? "CASH" : d.method || "CASH");

  // Capture the cost each returned product was sold at, so profit reports
  // credit the restock back to COGS at the same cost it was charged out at
  // (matching InvoiceItem.costSnapshot). Keyed by productId from the
  // original invoice; falls back to the product's current cost when the
  // return isn't linked to an invoice or the sale predates cost snapshots.
  const saleCostByProduct = new Map<string, number>();
  for (const item of invoice.items) {
    if (item.productId && item.costSnapshot != null) {
      saleCostByProduct.set(item.productId, toNum(item.costSnapshot));
    }
  }
  const productCosts = new Map(
    (
      await tx.product.findMany({
        where: { id: { in: returnLines.map((l) => l.productId) } },
        select: { id: true, costPrice: true, trackingType: true },
      })
    ).map((p) => [p.id, toNum(p.costPrice)]),
  );

  const created = await tx.salesReturn.create({
    data: {
      invoiceId: d.invoiceId,
      date: returnDate,
      totalRefund: total,
      method,
      cashRefund,
      balanceCredit: creditedToBalance,
      reason: d.reason?.trim() || null,
      createdByUserId: d.userId,
      exchangeSaleGroupId: d.exchangeSaleGroupId ?? null,
      items: {
        create: returnLines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unit: invoice.items.find((item) => item.productId === l.productId)?.unit ?? "EACH",
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          costSnapshot: saleCostByProduct.get(l.productId) ?? productCosts.get(l.productId) ?? null,
          restocked: l.restock,
        })),
      },
    },
  });

  if (openAgreement) {
    const agreementInput = {
      principal: toNum(openAgreement.principal),
      startDate: openAgreement.startDate,
      interestRatePerMonth: toNum(openAgreement.interestRatePerMonth),
      interestFreeMonths: openAgreement.interestFreeMonths,
    };
    const payments = openAgreement.payments.map((p) => ({
      amount: toNum(p.amount),
      discount: toNum(p.discount),
      paidDate: p.paidDate,
    }));
    const before = computeCreditState(agreementInput, payments, returnDate);
    creditedToBalance = round2(Math.min(before.outstanding, total));

    if (creditedToBalance > 0) {
      const paidDate = returnDate;
      await tx.payment.create({
        data: {
          agreementId: openAgreement.id,
          amount: creditedToBalance,
          paidDate,
          method: "RETURN",
          note: `Goods returned (return ${created.id})`,
          recordedByUserId: d.userId,
        },
      });
      const after = computeCreditState(agreementInput, [
        ...payments,
        { amount: creditedToBalance, paidDate },
      ], returnDate);
      const totalPaid = round2(
        payments.reduce((s, p) => s + p.amount, 0) + creditedToBalance,
      );
      await tx.invoice.update({
        where: { id: openAgreement.invoiceId },
        data: {
          amountPaid: totalPaid,
          status: after.isSettled ? "PAID" : "PARTIAL",
        },
      });
      if (after.isSettled) {
        await tx.creditAgreement.update({
          where: { id: openAgreement.id },
          data: { status: "SETTLED" },
        });
      }
    }
  }
  if (activeOpenAccount && openState && creditedToBalance > 0) {
    await tx.openAccountPayment.create({ data: { accountId: activeOpenAccount.id, amount: creditedToBalance, paidDate: returnDate, method: "RETURN", note: `Goods returned (return ${created.id})`, recordedByUserId: d.userId } });
    const credited = round2(openState.credited + creditedToBalance);
    const settled = credited >= toNum(activeOpenAccount.principal);
    await tx.invoice.update({ where: { id: activeOpenAccount.invoiceId }, data: { amountPaid: credited, status: openAccountInvoiceStatus(toNum(activeOpenAccount.principal), credited) } });
    await tx.openAccount.update({ where: { id: activeOpenAccount.id }, data: { status: settled ? "SETTLED" : "ACTIVE" } });
  }

  // Restock undamaged items and log the movement. Damaged items stay on the
  // return record only; they never re-enter sellable stock.
  for (const l of returnLines) {
    if (!l.restock) continue;
    const updated = await tx.product.update({
      where: { id: l.productId },
      data: { quantityInStock: { increment: l.qty } },
    });
    const soldItem = invoice.items.find((item) => item.productId === l.productId);
    if (soldItem) {
      await restoreInvoiceItemToBatches(tx, {
        invoiceItemId: soldItem.id,
        productId: l.productId,
        qty: l.qty,
        costPrice: saleCostByProduct.get(l.productId) ?? productCosts.get(l.productId) ?? toNum(updated.costPrice),
        label: "Customer return",
      });
    }
    await logStockMovement(tx, {
      productId: l.productId,
      type: "RETURN",
      qty: l.qty,
      balanceAfter: toNum(updated.quantityInStock),
      unit: invoice.items.find((item) => item.productId === l.productId)?.unit ?? "EACH",
      refId: created.id,
      userId: d.userId,
    });
  }
  return { id: created.id, totalRefund: total, cashRefund, creditedToBalance };
}
