"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logStockMovement } from "@/lib/stock";
import { computeCreditState } from "@/lib/credit";
import { round2, toNum } from "@/lib/utils";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
});

const inputSchema = z.object({
  invoiceId: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Select at least one item to return"),
});

export type CreateReturnInput = z.input<typeof inputSchema>;
export type CreateReturnResult =
  | { ok: true; id: string; creditedToBalance: number }
  | { ok: false; error: string };

export async function createReturn(input: CreateReturnInput): Promise<CreateReturnResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const d = parsed.data;
  const session = await getSession();
  const total = round2(d.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // If the invoice is a credit sale with an unsettled agreement, the
        // refund is applied to the customer's outstanding balance (capped at
        // what they still owe) instead of being handed out as cash. It goes
        // through the same Payment pipeline as a normal instalment so the
        // interest-first allocation, invoice status, and settlement logic all
        // stay authoritative.
        let creditedToBalance = 0;
        const agreement = d.invoiceId
          ? await tx.creditAgreement.findUnique({
              where: { invoiceId: d.invoiceId },
              include: { payments: true },
            })
          : null;
        const openAgreement = agreement && agreement.status !== "SETTLED" ? agreement : null;

        // Capture the cost each returned product was sold at, so profit reports
        // credit the restock back to COGS at the same cost it was charged out at
        // (matching InvoiceItem.costSnapshot). Keyed by productId from the
        // original invoice; falls back to the product's current cost when the
        // return isn't linked to an invoice or the sale predates cost snapshots.
        const saleCostByProduct = new Map<string, number>();
        if (d.invoiceId) {
          const originalItems = await tx.invoiceItem.findMany({
            where: { invoiceId: d.invoiceId, productId: { in: d.lines.map((l) => l.productId) } },
            select: { productId: true, costSnapshot: true },
          });
          for (const it of originalItems) {
            if (it.productId && it.costSnapshot != null) {
              saleCostByProduct.set(it.productId, toNum(it.costSnapshot));
            }
          }
        }
        const productCosts = new Map(
          (
            await tx.product.findMany({
              where: { id: { in: d.lines.map((l) => l.productId) } },
              select: { id: true, costPrice: true },
            })
          ).map((p) => [p.id, toNum(p.costPrice)]),
        );

        const created = await tx.salesReturn.create({
          data: {
            invoiceId: d.invoiceId || null,
            totalRefund: total,
            method: openAgreement ? "CREDIT_BALANCE" : d.method?.trim() || "CASH",
            reason: d.reason?.trim() || null,
            createdByUserId: session?.id ?? null,
            items: {
              create: d.lines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unitPrice: l.unitPrice,
                lineTotal: round2(l.qty * l.unitPrice),
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
            paidDate: p.paidDate,
          }));
          const before = computeCreditState(agreementInput, payments);
          creditedToBalance = round2(Math.min(before.outstanding, total));

          if (creditedToBalance > 0) {
            const paidDate = new Date();
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
            ]);
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

        // Restock returned items and log the movement.
        for (const l of d.lines) {
          const updated = await tx.product.update({
            where: { id: l.productId },
            data: { quantityInStock: { increment: l.qty } },
          });
          await logStockMovement(tx, {
            productId: l.productId,
            type: "RETURN",
            qty: l.qty,
            balanceAfter: updated.quantityInStock,
            refId: created.id,
            userId: session?.id ?? null,
          });
        }
        return { id: created.id, creditedToBalance };
      },
      { timeout: 20000 },
    );

    revalidatePath("/returns");
    revalidatePath("/products");
    revalidatePath("/credit");
    revalidatePath("/dashboard");
    if (d.invoiceId) revalidatePath(`/invoices/${d.invoiceId}`);
    return { ok: true, id: result.id, creditedToBalance: result.creditedToBalance };
  } catch (e) {
    console.error("createReturn failed", e);
    return { ok: false, error: "Could not save the return. Please try again." };
  }
}
