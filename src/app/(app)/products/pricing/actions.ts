"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logPriceChange } from "@/lib/price-change";
import { priceFromMargin, roundToStep, grossMarginPct, DEFAULT_ROUND_STEP } from "@/lib/pricing";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";
import { getSettings } from "@/lib/settings";
import { toNum, round2 } from "@/lib/utils";

/** Safety cap — refuse to re-price more than this many products at once. */
const MAX_ROWS = 500;

const inputSchema = z.object({
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  supplierId: z.string().optional(),
  type: z.enum(["APPLY_TARGET_MARGIN", "PERCENT_CHANGE", "FIXED_CHANGE"]),
  value: z.coerce.number().default(0),
  round: z.boolean().default(true),
});

export type BulkPricingInput = z.input<typeof inputSchema>;

export type BulkPreviewRow = {
  id: string;
  code: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  oldMarginPct: number;
  newMarginPct: number;
  belowCost: boolean;
};

export type BulkPreviewResult =
  | { ok: true; rows: BulkPreviewRow[]; total: number; changed: number; truncated: boolean }
  | { ok: false; error: string };

export type BulkApplyResult = { ok: true; updated: number } | { ok: false; error: string };

async function ensureAdmin(): Promise<{ id: string } | { error: string }> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") return { error: "Only admins can run bulk price changes." };
  return { id: me.id };
}

function buildWhere(d: z.infer<typeof inputSchema>, ntEnabled: boolean): Prisma.ProductWhereInput {
  return {
    active: true,
    ...productTaxableWhere(ntEnabled),
    // Subcategory is more specific than category — when both are set, the
    // subcategory wins (a subcategory already belongs to one category).
    ...(d.subcategoryId
      ? { subcategoryId: d.subcategoryId }
      : d.categoryId
        ? { categoryId: d.categoryId }
        : {}),
    ...(d.supplierId ? { primarySupplierId: d.supplierId } : {}),
  };
}

function hasFilter(d: z.infer<typeof inputSchema>): boolean {
  return Boolean(d.categoryId || d.subcategoryId || d.supplierId);
}

type ProductRow = {
  id: string;
  code: string;
  name: string;
  costPrice: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  targetMarginPct: Prisma.Decimal | null;
};

function computeNewPrice(
  p: ProductRow,
  type: z.infer<typeof inputSchema>["type"],
  value: number,
  round: boolean,
  defaultTarget: number,
): number {
  const cost = toNum(p.costPrice);
  const price = toNum(p.sellingPrice);
  let next = price;
  if (type === "APPLY_TARGET_MARGIN") {
    const target = p.targetMarginPct == null ? defaultTarget : toNum(p.targetMarginPct);
    next = priceFromMargin(cost, target);
  } else if (type === "PERCENT_CHANGE") {
    next = price * (1 + value / 100);
  } else if (type === "FIXED_CHANGE") {
    next = price + value;
  }
  next = roundToStep(next, round ? DEFAULT_ROUND_STEP : 0);
  return Math.max(0, round2(next));
}

const productSelect = {
  id: true,
  code: true,
  name: true,
  costPrice: true,
  sellingPrice: true,
  targetMarginPct: true,
} as const;

/** Dry run — compute the before/after for the filtered products without writing. */
export async function previewBulkPricing(input: BulkPricingInput): Promise<BulkPreviewResult> {
  const guard = await ensureAdmin();
  if ("error" in guard) return { ok: false, error: guard.error };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  if (!hasFilter(d)) return { ok: false, error: "Pick a category, subcategory or supplier first." };

  const ntEnabled = await nonTaxableEnabled();
  const settings = await getSettings();
  const defaultTarget = toNum(settings?.defaultTargetMarginPct ?? 20);

  const products = await prisma.product.findMany({
    where: buildWhere(d, ntEnabled),
    select: productSelect,
    orderBy: { code: "asc" },
    take: MAX_ROWS + 1,
  });
  const truncated = products.length > MAX_ROWS;
  const visible = products.slice(0, MAX_ROWS);

  let changed = 0;
  const rows: BulkPreviewRow[] = visible.map((p) => {
    const cost = toNum(p.costPrice);
    const oldPrice = toNum(p.sellingPrice);
    const newPrice = computeNewPrice(p, d.type, d.value, d.round, defaultTarget);
    if (newPrice !== oldPrice) changed++;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      oldPrice,
      newPrice,
      oldMarginPct: grossMarginPct(cost, oldPrice),
      newMarginPct: grossMarginPct(cost, newPrice),
      belowCost: cost > 0 && newPrice > 0 && newPrice < cost,
    };
  });

  return { ok: true, rows, total: products.length, changed, truncated };
}

/** Apply the re-pricing in one transaction and log a BULK price change per row. */
export async function applyBulkPricing(input: BulkPricingInput): Promise<BulkApplyResult> {
  const guard = await ensureAdmin();
  if ("error" in guard) return { ok: false, error: guard.error };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  if (!hasFilter(d)) return { ok: false, error: "Pick a category, subcategory or supplier first." };

  const ntEnabled = await nonTaxableEnabled();
  const settings = await getSettings();
  const defaultTarget = toNum(settings?.defaultTargetMarginPct ?? 20);

  const products = await prisma.product.findMany({
    where: buildWhere(d, ntEnabled),
    select: productSelect,
    orderBy: { code: "asc" },
    take: MAX_ROWS + 1,
  });
  if (products.length === 0) return { ok: false, error: "No products match that filter." };
  if (products.length > MAX_ROWS) {
    return { ok: false, error: `Too many products (${MAX_ROWS}+). Narrow the filter and try again.` };
  }

  const changes = products
    .map((p) => {
      const cost = toNum(p.costPrice);
      const oldPrice = toNum(p.sellingPrice);
      const newPrice = computeNewPrice(p, d.type, d.value, d.round, defaultTarget);
      return { id: p.id, cost, oldPrice, newPrice };
    })
    .filter((c) => c.newPrice !== c.oldPrice);

  if (changes.length === 0) return { ok: true, updated: 0 };

  const note = `Bulk: ${d.type}${d.type === "APPLY_TARGET_MARGIN" ? "" : ` ${d.value}`}`;
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const c of changes) {
          await tx.product.update({ where: { id: c.id }, data: { sellingPrice: c.newPrice } });
          await logPriceChange(tx, {
            productId: c.id,
            reason: "BULK",
            // Bulk only moves the selling price; cost is unchanged.
            oldCostPrice: c.cost,
            newCostPrice: c.cost,
            oldSellingPrice: c.oldPrice,
            newSellingPrice: c.newPrice,
            note,
            userId: guard.id,
          });
        }
      },
      { timeout: 20000 },
    );
  } catch (e) {
    console.error("applyBulkPricing failed", e);
    return { ok: false, error: "Could not apply the price changes. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath("/reports");
  return { ok: true, updated: changes.length };
}
