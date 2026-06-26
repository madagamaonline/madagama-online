import "server-only";
import type { Prisma, PriceChangeReason } from "@prisma/client";

/**
 * Append a row to the price-change audit trail. Call inside the same transaction
 * that updates the product's cost/selling price. Mirror of `logStockMovement`.
 */
export async function logPriceChange(
  tx: Prisma.TransactionClient,
  c: {
    productId: string;
    reason: PriceChangeReason;
    oldCostPrice: number;
    newCostPrice: number;
    oldSellingPrice: number;
    newSellingPrice: number;
    note?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  await tx.priceChange.create({
    data: {
      productId: c.productId,
      reason: c.reason,
      oldCostPrice: c.oldCostPrice,
      newCostPrice: c.newCostPrice,
      oldSellingPrice: c.oldSellingPrice,
      newSellingPrice: c.newSellingPrice,
      note: c.note ?? null,
      createdByUserId: c.userId ?? null,
    },
  });
}
