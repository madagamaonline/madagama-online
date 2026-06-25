"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logStockMovement } from "@/lib/stock";
import { round2, toNum } from "@/lib/utils";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  costPrice: z.coerce.number().min(0),
});

const inputSchema = z
  .object({
    supplierId: z.string().min(1, "Select a supplier"),
    supplierInvoiceNo: z.string().optional().nullable(),
    date: z.string().optional().nullable(),
    type: z.enum(["CASH", "CREDIT"]),
    creditDueDate: z.string().optional().nullable(),
    amountPaid: z.coerce.number().min(0).default(0),
    notes: z.string().optional().nullable(),
    lines: z.array(lineSchema).min(1, "Add at least one item"),
  })
  .refine((d) => d.type === "CASH" || !!d.creditDueDate, {
    message: "Credit purchases need a due date",
    path: ["creditDueDate"],
  });

export type CreatePurchaseInput = z.input<typeof inputSchema>;
export type CreatePurchaseResult = { ok: true; id: string } | { ok: false; error: string };

function statusFor(total: number, paid: number): "PAID" | "PARTIAL" | "CREDIT" {
  if (paid >= total) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "CREDIT";
}

export async function createPurchase(input: CreatePurchaseInput): Promise<CreatePurchaseResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const d = parsed.data;

  const total = round2(d.lines.reduce((s, l) => s + l.qty * l.costPrice, 0));
  const amountPaid = d.type === "CASH" ? total : round2(Math.min(d.amountPaid, total));
  const status = statusFor(total, amountPaid);
  const session = await getSession();

  try {
    const purchase = await prisma.$transaction(
      async (tx) => {
        const created = await tx.purchase.create({
          data: {
            supplierId: d.supplierId,
            supplierInvoiceNo: d.supplierInvoiceNo?.trim() || null,
            date: d.date ? new Date(d.date) : new Date(),
            type: d.type,
            total,
            amountPaid,
            creditDueDate: d.type === "CREDIT" && d.creditDueDate ? new Date(d.creditDueDate) : null,
            status,
            notes: d.notes?.trim() || null,
            items: {
              create: d.lines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                costPrice: l.costPrice,
                lineTotal: round2(l.qty * l.costPrice),
              })),
            },
          },
        });
        // Increase stock and update each product's latest cost price.
        for (const l of d.lines) {
          const updated = await tx.product.update({
            where: { id: l.productId },
            data: { quantityInStock: { increment: l.qty }, costPrice: l.costPrice },
          });
          await logStockMovement(tx, {
            productId: l.productId,
            type: "PURCHASE",
            qty: l.qty,
            balanceAfter: updated.quantityInStock,
            refId: created.id,
            userId: session?.id ?? null,
          });
        }
        return created;
      },
      { timeout: 20000 },
    );

    revalidatePath("/purchases");
    revalidatePath("/suppliers");
    revalidatePath("/products");
    return { ok: true, id: purchase.id };
  } catch (e) {
    console.error("createPurchase failed", e);
    return { ok: false, error: "Could not save the purchase. Please try again." };
  }
}

export type PurchasePaymentState = { error?: string; ok?: boolean };

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Enter a valid amount"),
  paidDate: z.string().optional(),
  note: z.string().optional(),
});

export async function recordPurchasePayment(
  purchaseId: string,
  _prev: PurchasePaymentState,
  formData: FormData,
): Promise<PurchasePaymentState> {
  const parsed = paymentSchema.safeParse({
    amount: formData.get("amount"),
    paidDate: formData.get("paidDate") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment" };

  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { error: "Purchase not found" };

  const newPaid = round2(toNum(purchase.amountPaid) + parsed.data.amount);
  const status = statusFor(toNum(purchase.total), newPaid);

  await prisma.$transaction([
    prisma.purchasePayment.create({
      data: {
        purchaseId,
        amount: parsed.data.amount,
        paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : new Date(),
        note: parsed.data.note?.trim() || null,
      },
    }),
    prisma.purchase.update({ where: { id: purchaseId }, data: { amountPaid: newPaid, status } }),
  ]);

  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/purchases");
  revalidatePath("/suppliers");
  return { ok: true };
}
