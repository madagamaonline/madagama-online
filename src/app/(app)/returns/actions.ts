"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionUser } from "@/lib/auth";
import { assertUniqueProductLines } from "@/lib/financial-guards";
import { applyCustomerReturn, ReturnValidationError } from "@/lib/customer-return";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  restock: z.boolean().optional(),
});

const inputSchema = z.object({
  invoiceId: z.string().min(1, "An invoice is required"),
  // Exchanges go through the POS (createCashInvoice with `exchange`) so the
  // return and the new sale are saved together; a standalone return is a refund.
  method: z.literal("CASH").optional().nullable(),
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
  try {
    assertUniqueProductLines(d.lines);
  } catch {
    return { ok: false, error: "Each product may appear only once in a return." };
  }
  const session = await requireActionUser();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const applied = await applyCustomerReturn(tx, {
          invoiceId: d.invoiceId,
          method: d.method,
          reason: d.reason,
          lines: d.lines,
          userId: session?.id ?? null,
        });
        return { id: applied.id, creditedToBalance: applied.creditedToBalance };
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
