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
  unitCost: z.coerce.number().min(0),
});

const inputSchema = z.object({
  purchaseId: z.string().min(1, "A purchase is required"),
  method: z.enum(["REDUCE_PAYABLE", "CASH_REFUND", "REPLACEMENT"]),
  reason: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Select at least one item to return"),
});

export type CreateSupplierReturnInput = z.input<typeof inputSchema>;
export type CreateSupplierReturnResult = { ok: true; id: string } | { ok: false; error: string };

function statusFor(total: number, paid: number): "PAID" | "PARTIAL" | "CREDIT" {
  if (paid >= total) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "CREDIT";
}

export async function createSupplierReturn(
  input: CreateSupplierReturnInput,
): Promise<CreateSupplierReturnResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const d = parsed.data;
  const session = await getSession();
  const total = round2(d.lines.reduce((s, l) => s + l.qty * l.unitCost, 0));

  const purchase = await prisma.purchase.findUnique({
    where: { id: d.purchaseId },
    select: { id: true, supplierId: true, total: true, amountPaid: true },
  });
  if (!purchase) return { ok: false, error: "Purchase not found" };

  try {
    const ret = await prisma.$transaction(
      async (tx) => {
        // Take goods out of stock, refusing to drive any product negative.
        for (const l of d.lines) {
          const product = await tx.product.findUnique({
            where: { id: l.productId },
            select: { quantityInStock: true, name: true },
          });
          if (!product) throw new Error("Product not found");
          if (product.quantityInStock < l.qty) {
            throw new Error(
              `Not enough stock of ${product.name} to return (have ${product.quantityInStock}, returning ${l.qty}).`,
            );
          }
        }

        // Settle the value: only REDUCE_PAYABLE touches the purchase balance,
        // capped at what's still owed so amountPaid never exceeds the total.
        let appliedToPayable = 0;
        if (d.method === "REDUCE_PAYABLE") {
          const balance = Math.max(0, round2(toNum(purchase.total) - toNum(purchase.amountPaid)));
          appliedToPayable = round2(Math.min(balance, total));
          if (appliedToPayable > 0) {
            const newPaid = round2(toNum(purchase.amountPaid) + appliedToPayable);
            await tx.purchase.update({
              where: { id: purchase.id },
              data: { amountPaid: newPaid, status: statusFor(toNum(purchase.total), newPaid) },
            });
          }
        }

        const created = await tx.supplierReturn.create({
          data: {
            supplierId: purchase.supplierId,
            purchaseId: purchase.id,
            totalValue: total,
            method: d.method,
            appliedToPayable,
            reason: d.reason?.trim() || null,
            createdByUserId: session?.id ?? null,
            items: {
              create: d.lines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unitCost: l.unitCost,
                lineTotal: round2(l.qty * l.unitCost),
              })),
            },
          },
        });

        for (const l of d.lines) {
          const updated = await tx.product.update({
            where: { id: l.productId },
            data: { quantityInStock: { decrement: l.qty } },
          });
          await logStockMovement(tx, {
            productId: l.productId,
            type: "SUPPLIER_RETURN",
            qty: -l.qty, // signed: stock out
            balanceAfter: updated.quantityInStock,
            refId: created.id,
            userId: session?.id ?? null,
          });
        }
        return created;
      },
      { timeout: 20000 },
    );

    revalidatePath("/supplier-returns");
    revalidatePath("/products");
    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${purchase.supplierId}`);
    revalidatePath(`/purchases/${purchase.id}`);
    return { ok: true, id: ret.id };
  } catch (e) {
    console.error("createSupplierReturn failed", e);
    const msg = e instanceof Error && e.message.startsWith("Not enough stock") ? e.message : "Could not save the return. Please try again.";
    return { ok: false, error: msg };
  }
}
