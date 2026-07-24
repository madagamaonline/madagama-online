"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, requireActionUser } from "@/lib/auth";
import { logStockMovement } from "@/lib/stock";
import { logPriceChange } from "@/lib/price-change";
import { nextProductCode } from "@/lib/product-code";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { toNum } from "@/lib/utils";
import { validateQuickProduct } from "@/lib/quick-product";

export type ProductFormState = { error?: string };

export type QuickCreateProductInput = {
  name: string;
  categoryId: string;
  subcategoryId?: string;
  sellingPrice: number;
  taxable: boolean;
  modelNumber?: string;
  barcode?: string;
  primarySupplierId?: string;
};

export type QuickCreateProductResult =
  | {
      ok: true;
      product: { id: string; code: string; name: string; costPrice: number; stock: number };
    }
  | { ok: false; error: string };

/** Defense in depth: every product mutation needs a real signed-in user. */
async function requireSessionState(): Promise<{ error: string } | null> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  return null;
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  categoryId: z.string().min(1, "Category is required"),
  // Optional — products can sit directly under a category with no subcategory.
  subcategoryId: z.string().optional(),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  targetMarginPct: z.coerce.number().min(0).max(99).optional(),
  quantityInStock: z.coerce.number().int().min(0),
  reorderLevel: z.coerce.number().int().min(0),
  barcode: z.string().optional(),
  modelNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  primarySupplierId: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Confirms the category exists and, if a subcategory was given, that it belongs
 * to that category. Returns the ids to persist or an error message.
 */
async function resolveCategory(
  categoryId: string,
  subcategoryId: string | undefined,
): Promise<{ categoryId: string; subcategoryId: string | null } | { error: string }> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return { error: "Invalid category" };
  if (!subcategoryId) return { categoryId, subcategoryId: null };
  const sub = await prisma.subcategory.findUnique({ where: { id: subcategoryId } });
  if (!sub || sub.categoryId !== categoryId) return { error: "Invalid subcategory" };
  return { categoryId, subcategoryId };
}

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    subcategoryId: formData.get("subcategoryId") || undefined,
    costPrice: formData.get("costPrice") || 0,
    sellingPrice: formData.get("sellingPrice") || 0,
    // Empty ⇒ undefined ⇒ stored as null (falls back to the global default).
    targetMarginPct: formData.get("targetMarginPct") || undefined,
    quantityInStock: formData.get("quantityInStock") || 0,
    reorderLevel: formData.get("reorderLevel") || 0,
    barcode: formData.get("barcode") || undefined,
    modelNumber: formData.get("modelNumber") || undefined,
    serialNumber: formData.get("serialNumber") || undefined,
    primarySupplierId: formData.get("primarySupplierId") || undefined,
    description: formData.get("description") || undefined,
  });
}

/** Creates the minimum catalog record needed while receiving a purchase. */
export async function quickCreateProduct(
  input: QuickCreateProductInput,
): Promise<QuickCreateProductResult> {
  try {
    await requireActionUser();
    const parsed = validateQuickProduct(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product details" };
    }
    const d = parsed.data;
    const resolved = await resolveCategory(d.categoryId, d.subcategoryId);
    if ("error" in resolved) return { ok: false, error: resolved.error };

    if (d.primarySupplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: d.primarySupplierId },
        select: { id: true },
      });
      if (!supplier) return { ok: false, error: "The selected supplier is no longer available." };
    }

    // The global switch is authoritative: callers cannot create a hidden
    // non-taxable product by sending a crafted action request.
    const taxable = (await nonTaxableEnabled()) ? d.taxable : true;
    const product = await prisma.$transaction(
      async (tx) => {
        const code = await nextProductCode(tx, resolved.categoryId, resolved.subcategoryId);
        return tx.product.create({
          data: {
            code,
            name: d.name,
            categoryId: resolved.categoryId,
            subcategoryId: resolved.subcategoryId,
            costPrice: 0,
            sellingPrice: d.sellingPrice,
            quantityInStock: 0,
            reorderLevel: 0,
            taxable,
            barcode: d.barcode?.trim() || null,
            modelNumber: d.modelNumber?.trim() || null,
            primarySupplierId: d.primarySupplierId || null,
          },
          select: { id: true, code: true, name: true, costPrice: true, quantityInStock: true },
        });
      },
      { timeout: 15000 },
    );

    revalidatePath("/products");
    return {
      ok: true,
      product: {
        id: product.id,
        code: product.code,
        name: product.name,
        costPrice: toNum(product.costPrice),
        stock: product.quantityInStock,
      },
    };
  } catch (error) {
    console.error("quickCreateProduct failed", error);
    return { ok: false, error: "Could not create the product. Please try again." };
  }
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

  const resolved = await resolveCategory(d.categoryId, d.subcategoryId);
  if ("error" in resolved) return { error: resolved.error };
  const session = await getSession();

  await prisma.$transaction(
    async (tx) => {
      const code = await nextProductCode(tx, resolved.categoryId, resolved.subcategoryId);
      const product = await tx.product.create({
        data: {
          code,
          name: d.name.trim(),
          description: d.description?.trim() || null,
          categoryId: resolved.categoryId,
          subcategoryId: resolved.subcategoryId,
          costPrice: d.costPrice,
          sellingPrice: d.sellingPrice,
          targetMarginPct: d.targetMarginPct ?? null,
          quantityInStock: d.quantityInStock,
          reorderLevel: d.reorderLevel,
          taxable,
          barcode: d.barcode?.trim() || null,
          modelNumber: d.modelNumber?.trim() || null,
          serialNumber: d.serialNumber?.trim() || null,
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

  const resolved = await resolveCategory(d.categoryId, d.subcategoryId);
  if ("error" in resolved) return { error: resolved.error };
  const session = await getSession();

  await prisma.$transaction(async (tx) => {
    const before = await tx.product.findUnique({
      where: { id },
      select: { costPrice: true, sellingPrice: true },
    });
    if (!before) throw new Error("Product not found");

    await tx.product.update({
      where: { id },
      data: {
        name: d.name.trim(),
        description: d.description?.trim() || null,
        categoryId: resolved.categoryId,
        subcategoryId: resolved.subcategoryId,
        costPrice: d.costPrice,
        sellingPrice: d.sellingPrice,
        targetMarginPct: d.targetMarginPct ?? null,
        // quantityInStock is intentionally not updated here — stock changes only
        // through Purchases (stock-in) and Sales (stock-out).
        reorderLevel: d.reorderLevel,
        taxable,
        barcode: d.barcode?.trim() || null,
        modelNumber: d.modelNumber?.trim() || null,
        serialNumber: d.serialNumber?.trim() || null,
        primarySupplierId: d.primarySupplierId || null,
      },
    });

    // Keep the price-change audit complete for manual edits.
    const oldCost = toNum(before.costPrice);
    const oldPrice = toNum(before.sellingPrice);
    if (oldCost !== d.costPrice || oldPrice !== d.sellingPrice) {
      await logPriceChange(tx, {
        productId: id,
        reason: "MANUAL",
        oldCostPrice: oldCost,
        newCostPrice: d.costPrice,
        oldSellingPrice: oldPrice,
        newSellingPrice: d.sellingPrice,
        userId: session?.id ?? null,
      });
    }
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
        select: { quantityInStock: true, quantityReserved: true },
      });
      if (!p) throw new Error("not_found");
      if (p.quantityInStock + delta < p.quantityReserved) throw new Error("reserved");
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
    if ((e as Error).message === "reserved") return { error: "That would reduce physical stock below the quantity reserved for layaways." };
    if ((e as Error).message === "not_found") return { error: "Product not found." };
    console.error("adjustStock failed", e);
    return { error: "Could not adjust stock." };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true };
}
