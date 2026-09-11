"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionUser } from "@/lib/auth";
import { assertUniqueProductLines } from "@/lib/financial-guards";
import { customerReturnAllowances, returnLineValue } from "@/lib/return-values";
import { logStockMovement } from "@/lib/stock";
import { computeCreditState } from "@/lib/credit";
import { round2, toNum } from "@/lib/utils";
import { computeOpenAccountState, openAccountInvoiceStatus } from "@/lib/open-account";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

const inputSchema = z.object({
  invoiceId: z.string().min(1, "An invoice is required"),
  method: z.enum(["CASH", "CREDIT_NOTE", "EXCHANGE"]).optional().nullable(),
  reason: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Select at least one item to return"),
});

export type CreateReturnInput = z.input<typeof inputSchema>;
export type CreateReturnResult =
  | { ok: true; id: string; creditedToBalance: number }
  | { ok: false; error: string };

class ReturnValidationError extends Error {}

export async function createReturn(input: CreateReturnInput): Promise<CreateReturnResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const d = parsed.data;
  try {
    assertUniqueProductLines(d.lines);
  } catch {
    return { ok: false, error: "Each product may appear only once in a return." };
  }
  const session = await requireActionUser();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id: d.invoiceId },
          select: {
            voidedAt: true,
            grandTotal: true,
            items: {
              select: {
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
            return { ...line, unitPrice: round2(lineTotal / line.qty), lineTotal };
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
        const cashRefund = openAgreement || activeOpenAccount || !d.method || d.method === "CASH"
          ? round2(total - creditedToBalance) : 0;
        const method = creditedToBalance > 0
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
            createdByUserId: session?.id ?? null,
            items: {
              create: returnLines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unit: invoice.items.find((item) => item.productId === l.productId)?.unit ?? "EACH",
                unitPrice: l.unitPrice,
                lineTotal: l.lineTotal,
                costSnapshot: saleCostByProduct.get(l.productId) ?? productCosts.get(l.productId) ?? null,
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
                recordedByUserId: session?.id ?? null,
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
          await tx.openAccountPayment.create({ data: { accountId: activeOpenAccount.id, amount: creditedToBalance, paidDate: returnDate, method: "RETURN", note: `Goods returned (return ${created.id})`, recordedByUserId: session.id } });
          const credited = round2(openState.credited + creditedToBalance);
          const settled = credited >= toNum(activeOpenAccount.principal);
          await tx.invoice.update({ where: { id: activeOpenAccount.invoiceId }, data: { amountPaid: credited, status: openAccountInvoiceStatus(toNum(activeOpenAccount.principal), credited) } });
          await tx.openAccount.update({ where: { id: activeOpenAccount.id }, data: { status: settled ? "SETTLED" : "ACTIVE" } });
        }

        // Restock returned items and log the movement.
        for (const l of returnLines) {
          const updated = await tx.product.update({
            where: { id: l.productId },
            data: { quantityInStock: { increment: l.qty } },
          });
          await logStockMovement(tx, {
            productId: l.productId,
            type: "RETURN",
            qty: l.qty,
            balanceAfter: toNum(updated.quantityInStock),
            unit: invoice.items.find((item) => item.productId === l.productId)?.unit ?? "EACH",
            refId: created.id,
            userId: session?.id ?? null,
          });
        }
        return { id: created.id, creditedToBalance };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );

    revalidatePath("/returns");
    revalidatePath("/products");
    revalidatePath("/credit");
    revalidatePath("/dashboard");
    revalidatePath("/open-accounts");
    revalidatePath("/reports");
    revalidatePath("/shift-report");
    if (d.invoiceId) revalidatePath(`/invoices/${d.invoiceId}`);
    return { ok: true, id: result.id, creditedToBalance: result.creditedToBalance };
  } catch (e) {
    if (e instanceof ReturnValidationError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return { ok: false, error: "Another return was saved at the same time. Please try again." };
    }
    console.error("createReturn failed", e);
    return { ok: false, error: "Could not save the return. Please try again." };
  }
}
