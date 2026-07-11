import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { decrementStockForSale, StockConflictError } from "./stock-decrement";

function fakeTx(count: number, balance = 2) {
  return {
    product: {
      updateMany: vi.fn().mockResolvedValue({ count }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ quantityInStock: balance }),
    },
  } as unknown as Pick<Prisma.TransactionClient, "product">;
}

describe("decrementStockForSale", () => {
  it("uses an atomic quantity guard and returns the resulting balance", async () => {
    const tx = fakeTx(1, 3);
    await expect(
      decrementStockForSale(tx, { productId: "p1", productCode: "P-1", qty: 2 }),
    ).resolves.toBe(3);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", active: true, quantityInStock: { gte: 2 } },
      data: { quantityInStock: { decrement: 2 } },
    });
  });

  it("rejects the loser of a concurrent stock race", async () => {
    const tx = fakeTx(0);
    await expect(
      decrementStockForSale(tx, { productId: "p1", productCode: "P-1", qty: 1 }),
    ).rejects.toBeInstanceOf(StockConflictError);
    expect(tx.product.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
