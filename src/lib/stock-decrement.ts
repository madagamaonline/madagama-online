import type { Prisma } from "@prisma/client";

export class StockConflictError extends Error {
  constructor(public readonly productCode: string) {
    super(`Insufficient stock for ${productCode}`);
    this.name = "StockConflictError";
  }
}

/** Atomically decrement only when enough stock still exists at write time. */
export async function decrementStockForSale(
  tx: Pick<Prisma.TransactionClient, "product">,
  line: { productId: string; productCode: string; qty: number },
): Promise<number> {
  const current = await tx.product.findUnique({
    where: { id: line.productId },
    select: { quantityInStock: true, quantityReserved: true },
  });
  if (!current || current.quantityInStock - current.quantityReserved < line.qty) {
    throw new StockConflictError(line.productCode);
  }
  const decremented = await tx.product.updateMany({
    where: {
      id: line.productId,
      active: true,
      quantityInStock: { gte: line.qty + current.quantityReserved },
      quantityReserved: current.quantityReserved,
    },
    data: { quantityInStock: { decrement: line.qty } },
  });
  if (decremented.count !== 1) throw new StockConflictError(line.productCode);

  const updated = await tx.product.findUniqueOrThrow({
    where: { id: line.productId },
    select: { quantityInStock: true },
  });
  return updated.quantityInStock;
}
