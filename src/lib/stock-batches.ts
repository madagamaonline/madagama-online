import type { Prisma } from "@prisma/client";
import { round2, toNum } from "@/lib/utils";
import { roundQuantity } from "@/lib/units";

/**
 * Stock batches: every unit of stock belongs to a batch with its own cost and
 * selling price (normally one batch per purchase line). These helpers keep the
 * batches in step with Product.quantityInStock — call them inside the same
 * transaction that changes the product's stock.
 */

type Tx = Prisma.TransactionClient;

export type BatchTake = { batchId: string; qty: number; costPrice: number };

export class BatchConflictError extends Error {
  constructor() {
    super("Stock batch changed while saving");
    this.name = "BatchConflictError";
  }
}

/** Ordering for "oldest first" consumption. */
const FIFO: Prisma.StockBatchOrderByWithRelationInput[] = [{ receivedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }];

/**
 * Plan which batches `qty` units come from: the preferred batch first, then the
 * oldest batches. Pure so it can be unit tested.
 */
export function planBatchTake(
  batches: { id: string; qtyRemaining: number; costPrice: number }[],
  qty: number,
  preferredBatchId?: string | null,
): { takes: BatchTake[]; shortfall: number } {
  const ordered = preferredBatchId
    ? [...batches.filter((b) => b.id === preferredBatchId), ...batches.filter((b) => b.id !== preferredBatchId)]
    : batches;
  const takes: BatchTake[] = [];
  let left = roundQuantity(qty);
  for (const batch of ordered) {
    if (left <= 0) break;
    const take = roundQuantity(Math.min(left, batch.qtyRemaining));
    if (take <= 0) continue;
    takes.push({ batchId: batch.id, qty: take, costPrice: batch.costPrice });
    left = roundQuantity(left - take);
  }
  return { takes, shortfall: Math.max(0, left) };
}

/** Weighted unit cost of a set of takes, with any shortfall valued at `fallbackCost`. */
export function weightedTakeCost(takes: BatchTake[], shortfall: number, fallbackCost: number): number {
  const qty = takes.reduce((s, t) => s + t.qty, 0) + shortfall;
  if (qty <= 0) return round2(fallbackCost);
  const value = takes.reduce((s, t) => s + t.qty * t.costPrice, 0) + shortfall * fallbackCost;
  return round2(value / qty);
}

/**
 * Take `qty` units out of a product's batches. Returns what was taken and any
 * shortfall: units the batches could not cover (only possible if batches drifted
 * from the product's stock count; the caller has already checked product stock).
 */
export async function takeFromBatches(
  tx: Tx,
  input: { productId: string; qty: number; preferredBatchId?: string | null },
): Promise<{ takes: BatchTake[]; shortfall: number }> {
  const batches = await tx.stockBatch.findMany({
    where: { productId: input.productId, qtyRemaining: { gt: 0 } },
    orderBy: FIFO,
    select: { id: true, qtyRemaining: true, costPrice: true },
  });
  const plan = planBatchTake(
    batches.map((b) => ({ id: b.id, qtyRemaining: toNum(b.qtyRemaining), costPrice: toNum(b.costPrice) })),
    input.qty,
    input.preferredBatchId,
  );
  for (const take of plan.takes) {
    const updated = await tx.stockBatch.updateMany({
      where: { id: take.batchId, qtyRemaining: { gte: take.qty } },
      data: { qtyRemaining: { decrement: take.qty } },
    });
    if (updated.count !== 1) throw new BatchConflictError();
  }
  if (plan.shortfall > 0) {
    console.warn(`Stock batches for product ${input.productId} are short by ${plan.shortfall}; valued at product cost.`);
  }
  return plan;
}

/** Create a new batch (purchase, opening stock, adjustment in). */
export async function createBatch(
  tx: Tx,
  input: {
    productId: string;
    qty: number;
    costPrice: number;
    sellingPrice: number;
    purchaseItemId?: string | null;
    label?: string | null;
    receivedAt?: Date;
  },
) {
  return tx.stockBatch.create({
    data: {
      productId: input.productId,
      purchaseItemId: input.purchaseItemId ?? null,
      label: input.label ?? null,
      receivedAt: input.receivedAt ?? new Date(),
      qtyReceived: input.qty,
      qtyRemaining: input.qty,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
    },
  });
}

/**
 * Put units back into stock with no known source batch: they join the newest
 * batch with the same cost, or start a new batch at the product's price.
 */
export async function returnUnbatchedStock(
  tx: Tx,
  input: { productId: string; qty: number; costPrice: number; label: string },
): Promise<void> {
  const match = await tx.stockBatch.findFirst({
    where: { productId: input.productId, costPrice: input.costPrice },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (match) {
    await tx.stockBatch.update({ where: { id: match.id }, data: { qtyRemaining: { increment: input.qty } } });
    return;
  }
  const product = await tx.product.findUniqueOrThrow({
    where: { id: input.productId },
    select: { sellingPrice: true },
  });
  await createBatch(tx, {
    productId: input.productId,
    qty: input.qty,
    costPrice: input.costPrice,
    sellingPrice: toNum(product.sellingPrice),
    label: input.label,
  });
}

/**
 * Record which batches each line of a just-created invoice was sold from, and
 * set the line's costSnapshot to the real (weighted) cost of those batches.
 * Product stock must already have been decremented by the caller.
 */
export async function allocateInvoiceToBatches(
  tx: Tx,
  invoiceId: string,
  lines: { productId: string; qty: number; batchId?: string | null }[],
): Promise<void> {
  const items = await tx.invoiceItem.findMany({
    where: { invoiceId },
    select: { id: true, productId: true, costSnapshot: true, product: { select: { costPrice: true } } },
  });
  const byProduct = new Map(items.map((item) => [item.productId, item]));
  for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const item = byProduct.get(line.productId);
    if (!item) continue;
    const { takes, shortfall } = await takeFromBatches(tx, {
      productId: line.productId,
      qty: line.qty,
      preferredBatchId: line.batchId,
    });
    if (takes.length) {
      await tx.invoiceItemBatch.createMany({
        data: takes.map((t) => ({ invoiceItemId: item.id, batchId: t.batchId, qty: t.qty, costPrice: t.costPrice })),
      });
    }
    const fallback = item.costSnapshot != null ? toNum(item.costSnapshot) : toNum(item.product?.costPrice ?? 0);
    await tx.invoiceItem.update({
      where: { id: item.id },
      data: { costSnapshot: weightedTakeCost(takes, shortfall, fallback) },
    });
  }
}

/**
 * Put `qty` units of a sold invoice line back into the batches they came from
 * (void or customer return). Units with no recorded batch (sales made before
 * batches existed) go back via returnUnbatchedStock at the line's sale cost.
 */
export async function restoreInvoiceItemToBatches(
  tx: Tx,
  input: { invoiceItemId: string; productId: string; qty: number; costPrice: number; label: string },
): Promise<void> {
  const allocations = await tx.invoiceItemBatch.findMany({
    where: { invoiceItemId: input.invoiceItemId },
    orderBy: { id: "desc" },
    select: { id: true, batchId: true, qty: true, qtyRestored: true },
  });
  let left = roundQuantity(input.qty);
  for (const a of allocations) {
    if (left <= 0) break;
    const put = roundQuantity(Math.min(left, toNum(a.qty) - toNum(a.qtyRestored)));
    if (put <= 0) continue;
    await tx.invoiceItemBatch.update({ where: { id: a.id }, data: { qtyRestored: { increment: put } } });
    await tx.stockBatch.update({ where: { id: a.batchId }, data: { qtyRemaining: { increment: put } } });
    left = roundQuantity(left - put);
  }
  if (left > 0) {
    await returnUnbatchedStock(tx, { productId: input.productId, qty: left, costPrice: input.costPrice, label: input.label });
  }
}
