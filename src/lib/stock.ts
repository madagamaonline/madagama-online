import "server-only";
import type { Prisma, StockMovementType, UnitOfMeasure } from "@prisma/client";

/**
 * Append a row to the stock audit trail. `qty` is signed (positive = stock in,
 * negative = stock out) and `balanceAfter` is the product's stock level after
 * the change. Call this inside the same transaction that updates the product.
 */
export async function logStockMovement(
  tx: Prisma.TransactionClient,
  m: {
    productId: string;
    type: StockMovementType;
    qty: number;
    balanceAfter: number;
    unit?: UnitOfMeasure;
    reason?: string | null;
    refId?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  await tx.stockMovement.create({
    data: {
      productId: m.productId,
      type: m.type,
      qty: m.qty,
      balanceAfter: m.balanceAfter,
      unit: m.unit ?? "EACH",
      reason: m.reason ?? null,
      refId: m.refId ?? null,
      createdByUserId: m.userId ?? null,
    },
  });
}
