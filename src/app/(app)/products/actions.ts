"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logStockMovement } from "@/lib/stock";
import { nextProductCode } from "@/lib/product-code";
import { nonTaxableEnabled } from "@/lib/tax-mode";

export type ProductFormState = { error?: string };

/** Defense in depth: every product mutation needs a real signed-in user. */
async function requireSessionState(): Promise<{ error: string } | null> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  return null;
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  subcategoryId: z.string().min(1, "Subcategory is required"),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  quantityInStock: z.coerce.number().int().min(0),
  reorderLevel: z.coerce.number().int().min(0),
  barcode: z.string().optional(),
  primarySupplierId: z.string().optional(),
  description: z.string().optional(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    subcategoryId: formData.get("subcategoryId"),
    costPrice: formData.get("costPrice") || 0,
    sellingPrice: formData.get("sellingPrice") || 0,
    quantityInStock: formData.get("quantityInStock") || 0,
    reorderLevel: formData.get("reorderLevel") || 0,
    barcode: formData.get("barcode") || undefined,
    primarySupplierId: formData.get("primarySupplierId") || undefined,
    description: formData.get("description") || undefined,
  });
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const denied = await requireSessionState();
  if (denied) return denied;
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  // When the non-taxable switch is off, every new product is taxable — the
  // checkbox is hidden in the form, so coerce here too as a safety net.
  const taxable = (await nonTaxableEnabled()) ? formData.get("taxable") === "on" : true;

  const sub = await prisma.subcategory.findUnique({ where: { id: d.subcategoryId } });
  if (!sub) return { error: "Invalid subcategory" };
  const session = await getSession();

  await prisma.$transaction(
    async (tx) => {
      const code = await nextProductCode(tx, d.subcategoryId);
      const product = await tx.product.create({
        data: {
          code,
          name: d.name.trim(),
          description: d.description?.trim() || null,
          categoryId: sub.categoryId,
          subcategoryId: d.subcategoryId,
          costPrice: d.costPrice,
          sellingPrice: d.sellingPrice,
          quantityInStock: d.quantityInStock,
          reorderLevel: d.reorderLevel,
          taxable,
          barcode: d.barcode?.trim() || null,
          primarySupplierId: d.primarySupplierId || null,
        },
      });
      if (d.quantityInStock > 0) {
        await logStockMovement(tx, {
          productId: product.id,
          type: "OPENING",
          qty: d.quantityInStock,
          balanceAfter: d.quantityInStock,
          reason: "Opening stock",
          userId: session?.id ?? null,
        });
      }
    },
    { timeout: 15000 },
  );

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const denied = await requireSessionState();
  if (denied) return denied;
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  // When the non-taxable switch is off, the checkbox is hidden — keep edits
  // taxable so an existing product can't be flipped to non-taxable.
  const taxable = (await nonTaxableEnabled()) ? formData.get("taxable") === "on" : true;

  const sub = await prisma.subcategory.findUnique({ where: { id: d.subcategoryId } });
  if (!sub) return { error: "Invalid subcategory" };

  await prisma.product.update({
    where: { id },
    data: {
      name: d.name.trim(),
      description: d.description?.trim() || null,
      categoryId: sub.categoryId,
      subcategoryId: d.subcategoryId,
      costPrice: d.costPrice,
      sellingPrice: d.sellingPrice,
      // quantityInStock is intentionally not updated here — stock changes only
      // through Purchases (stock-in) and Sales (stock-out).
      reorderLevel: d.reorderLevel,
      taxable,
      barcode: d.barcode?.trim() || null,
      primarySupplierId: d.primarySupplierId || null,
    },
  });

  revalidatePath("/products");
  redirect("/products");
}

export async function toggleProductActive(id: string, active: boolean) {
  const me = await getSession();
  if (!me) throw new Error("Not authorized.");
  await prisma.product.update({ where: { id }, data: { active } });
  revalidatePath("/products");
}

export type AdjustStockState = { error?: string; ok?: boolean };

/** Manually correct a product's stock (damage, theft, stock-take) with an audit trail. */
export async function adjustStock(
  productId: string,
  _prev: AdjustStockState,
  formData: FormData,
): Promise<AdjustStockState> {
  const denied = await requireSessionState();
  if (denied) return denied;
  const direction = formData.get("direction"); // "in" | "out"
  const qty = Math.trunc(Number(formData.get("qty")));
  const reason = (formData.get("reason") as string | null)?.trim() || "";
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Enter a whole quantity greater than 0." };
  if (!reason) return { error: "Please give a reason for the adjustment." };
  const delta = direction === "out" ? -qty : qty;

  const session = await getSession();
  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.product.findUnique({
        where: { id: productId },
        select: { quantityInStock: true },
      });
      if (!p) throw new Error("not_found");
      if (p.quantityInStock + delta < 0) throw new Error("negative");
      const updated = await tx.product.update({
        where: { id: productId },
        data: { quantityInStock: { increment: delta } },
      });
      await logStockMovement(tx, {
        productId,
        type: "ADJUSTMENT",
        qty: delta,
        balanceAfter: updated.quantityInStock,
        reason,
        userId: session?.id ?? null,
      });
    });
  } catch (e) {
    if ((e as Error).message === "negative") return { error: "That would make stock negative." };
    if ((e as Error).message === "not_found") return { error: "Product not found." };
    console.error("adjustStock failed", e);
    return { error: "Could not adjust stock." };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true };
}
