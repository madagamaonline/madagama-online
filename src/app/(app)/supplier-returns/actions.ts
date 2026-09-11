"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { serializableTransaction } from "@/lib/serializable-transaction";
import { supplierReturnAllowances, returnLineValue } from "@/lib/return-values";
import { assertUniqueProductLines } from "@/lib/financial-guards";
import { decrementStockForSale } from "@/lib/stock-decrement";
import { logStockMovement } from "@/lib/stock";
import { round2, toNum } from "@/lib/utils";
import { nonTaxableEnabled, purchaseTaxableWhere } from "@/lib/tax-mode";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
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
  const session = await requireActionUser();
  const taxWhere = purchaseTaxableWhere(await nonTaxableEnabled());

  try {
    assertUniqueProductLines(d.lines);
    const ret = await serializableTransaction(
      async (tx) => {
        const purchase = await tx.purchase.findFirst({
          where: { id: d.purchaseId, ...taxWhere },
          include: { items: true, returns: { include: { items: true } } },
        });
        if (!purchase) throw new Error("Purchase not found.");
        const allowed = supplierReturnAllowances(
          purchase.items.map((item) => ({ ...item, qty: toNum(item.qty), costPrice: toNum(item.costPrice) })),
          purchase.returns.flatMap((ret) => ret.items.map((item) => ({ ...item, qty: toNum(item.qty), lineTotal: toNum(item.lineTotal) }))),
        );
        const lines = d.lines.map((line) => {
          const allowance = allowed.get(line.productId);
          if (!allowance || allowance.qty <= 0) throw new Error("This product has no remaining quantity on the purchase.");
          const lineTotal = returnLineValue(allowance, line.qty);
          return { ...line, unit: allowance.unit as "EACH" | "METER", unitCost: round2(lineTotal / line.qty), lineTotal };
        });
        const total = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
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
            createdByUserId: session.id,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unit: l.unit,
                unitCost: l.unitCost,
                lineTotal: l.lineTotal,
              })),
            },
          },
        });

        for (const l of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const balanceAfter = await decrementStockForSale(tx, { productId: l.productId, productCode: l.productId, qty: l.qty });
          await logStockMovement(tx, {
            productId: l.productId,
            type: "SUPPLIER_RETURN",
            qty: -l.qty, // signed: stock out
            balanceAfter,
            unit: l.unit,
            refId: created.id,
            userId: session.id,
          });
        }
        return { ...created, supplierId: purchase.supplierId, purchaseId: purchase.id };
      },
    );

    revalidatePath("/supplier-returns");
    revalidatePath("/products");
    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${ret.supplierId}`);
    revalidatePath(`/purchases/${ret.purchaseId}`);
    return { ok: true, id: ret.id };
  } catch (e) {
    console.error("createSupplierReturn failed", e);
    const msg = e instanceof Error && !e.message.includes("prisma") ? e.message : "Could not save the return. Please try again.";
    return { ok: false, error: msg };
  }
}
