import type { Prisma } from "@prisma/client";

/**
 * Builds a human-readable product code: CATEGORY-SUBCATEGORY-NNNN
 * e.g. ("AGR", "TOOL", 1) -> "AGR-TOOL-0001"
 */
export function buildProductCode(
  categoryCode: string,
  subcategoryCode: string,
  seq: number,
): string {
  return `${categoryCode}-${subcategoryCode}-${String(seq).padStart(4, "0")}`;
}

/**
 * Atomically reserves the next sequence number for a subcategory and returns
 * the resulting product code. Must run inside a transaction so concurrent
 * product creation never produces duplicate codes.
 */
export async function nextProductCode(
  tx: Prisma.TransactionClient,
  subcategoryId: string,
): Promise<string> {
  const sub = await tx.subcategory.update({
    where: { id: subcategoryId },
    data: { seq: { increment: 1 } },
    include: { category: true },
  });
  return buildProductCode(sub.category.code, sub.code, sub.seq);
}
