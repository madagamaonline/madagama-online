"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionUser } from "@/lib/auth";
import { validatePaymentAmount } from "@/lib/financial-guards";
import { logStockMovement } from "@/lib/stock";
import { logPriceChange } from "@/lib/price-change";
import { weightedAvgCost } from "@/lib/pricing";
import { round2, toNum } from "@/lib/utils";
import { nonTaxableEnabled, purchaseTaxableWhere } from "@/lib/tax-mode";
import { canonicalUnit, isUnitAllowed, toCanonicalQuantity } from "@/lib/units";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  enteredQty: z.coerce.number().positive().optional(),
  enteredUnit: z.enum(["EACH", "METER", "CENTIMETER", "MILLIMETER", "FOOT", "INCH"]).optional(),
  packageCount: z.coerce.number().int().positive().default(1),
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

  const session = await requireActionUser();
  const ntEnabled = await nonTaxableEnabled();
  const products = await prisma.product.findMany({
    where: { id: { in: d.lines.map((line) => line.productId) } },
    select: { id: true, trackingType: true, taxable: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  if (products.length !== new Set(d.lines.map((line) => line.productId)).size) return { ok: false, error: "One of the products no longer exists." };
  if (!ntEnabled && products.some((product) => !product.taxable)) return { ok: false, error: "Non-taxable products are currently hidden." };
  const normalizedLines = [] as Array<(typeof d.lines)[number] & { qty: number; enteredQty: number; enteredUnit: import("@prisma/client").UnitOfMeasure; unit: import("@prisma/client").UnitOfMeasure }>;
  for (const line of d.lines) {
    const product = byId.get(line.productId)!;
    const enteredQty = line.enteredQty ?? line.qty;
    const enteredUnit = line.enteredUnit ?? canonicalUnit(product.trackingType);
    if (!isUnitAllowed(product.trackingType, enteredUnit)) return { ok: false, error: "Choose a valid purchase unit." };
    if (product.trackingType === "PIECE" && (!Number.isInteger(enteredQty) || !Number.isInteger(line.packageCount))) return { ok: false, error: "Piece products require whole quantities." };
    const qty = toCanonicalQuantity(enteredQty * line.packageCount, enteredUnit, product.trackingType);
    normalizedLines.push({ ...line, qty, enteredQty, enteredUnit, unit: canonicalUnit(product.trackingType) });
  }
  const total = round2(normalizedLines.reduce((s, l) => s + l.qty * l.costPrice, 0));
  const amountPaid = d.type === "CASH" ? total : round2(Math.min(d.amountPaid, total));
  const status = statusFor(total, amountPaid);

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
              create: normalizedLines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unit: l.unit,
                enteredQty: l.enteredQty,
                enteredUnit: l.enteredUnit,
                packageCount: l.packageCount,
                costPrice: l.costPrice,
                lineTotal: round2(l.qty * l.costPrice),
              })),
            },
          },
        });
        // Increase stock and re-derive each product's cost as the weighted
        // average of existing stock and the newly-purchased units.
        for (const l of normalizedLines) {
          const before = await tx.product.findUnique({
            where: { id: l.productId },
            select: { quantityInStock: true, costPrice: true, sellingPrice: true },
          });
          if (!before) throw new Error("Product not found");
          const oldCost = toNum(before.costPrice);
          const newCost = weightedAvgCost(toNum(before.quantityInStock), oldCost, l.qty, l.costPrice);

          const updated = await tx.product.update({
            where: { id: l.productId },
            data: { quantityInStock: { increment: l.qty }, costPrice: newCost },
          });
          await logStockMovement(tx, {
            productId: l.productId,
            type: "PURCHASE",
            qty: l.qty,
            balanceAfter: toNum(updated.quantityInStock),
            refId: created.id,
            userId: session?.id ?? null,
            unit: l.unit,
          });
          if (newCost !== oldCost) {
            await logPriceChange(tx, {
              productId: l.productId,
              reason: "PURCHASE_WAC",
              oldCostPrice: oldCost,
              newCostPrice: newCost,
              // Selling price is left untouched — the system suggests a re-price
              // (below-target badge) rather than silently changing it.
              oldSellingPrice: toNum(before.sellingPrice),
              newSellingPrice: toNum(before.sellingPrice),
              note: `Purchase at ${l.costPrice} × ${l.qty}`,
              userId: session?.id ?? null,
            });
          }
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

  await requireActionUser();
  const ntEnabled = await nonTaxableEnabled();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const purchase = await tx.purchase.findFirst({
            where: { id: purchaseId, ...purchaseTaxableWhere(ntEnabled) },
          });
          if (!purchase) return { error: "Purchase not found" };
          const outstanding = round2(toNum(purchase.total) - toNum(purchase.amountPaid));
          const paymentError = validatePaymentAmount(parsed.data.amount, outstanding);
          if (paymentError) return { error: paymentError };

          const newPaid = round2(toNum(purchase.amountPaid) + parsed.data.amount);
          await tx.purchasePayment.create({
            data: {
              purchaseId,
              amount: parsed.data.amount,
              paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : new Date(),
              note: parsed.data.note?.trim() || null,
            },
          });
          await tx.purchase.update({
            where: { id: purchaseId },
            data: { amountPaid: newPaid, status: statusFor(toNum(purchase.total), newPaid) },
          });
          return { error: null };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );
      if (result.error) return { error: result.error };
      break;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034" && attempt < 2) continue;
      console.error("recordPurchasePayment failed", e);
      return { error: "Could not record the payment. Please try again." };
    }
  }

  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/purchases");
  revalidatePath("/suppliers");
  return { ok: true };
}
