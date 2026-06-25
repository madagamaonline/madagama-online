"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logStockMovement } from "@/lib/stock";
import { round2 } from "@/lib/utils";

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
export type CreateReturnResult = { ok: true; id: string } | { ok: false; error: string };

export async function createReturn(input: CreateReturnInput): Promise<CreateReturnResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const d = parsed.data;
  const session = await getSession();
  const total = round2(d.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));

  try {
    const ret = await prisma.$transaction(
      async (tx) => {
        const created = await tx.salesReturn.create({
          data: {
            invoiceId: d.invoiceId || null,
            totalRefund: total,
            method: d.method?.trim() || "CASH",
            reason: d.reason?.trim() || null,
            createdByUserId: session?.id ?? null,
            items: {
              create: d.lines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unitPrice: l.unitPrice,
                lineTotal: round2(l.qty * l.unitPrice),
              })),
            },
          },
        });
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
        return created;
      },
      { timeout: 20000 },
    );

    revalidatePath("/returns");
    revalidatePath("/products");
    if (d.invoiceId) revalidatePath(`/invoices/${d.invoiceId}`);
    return { ok: true, id: ret.id };
  } catch (e) {
    console.error("createReturn failed", e);
    return { ok: false, error: "Could not save the return. Please try again." };
  }
}
