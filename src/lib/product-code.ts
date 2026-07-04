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
 * Parses a typed sticker short code: "123" or "#123" -> 123, else null.
 * Capped at 9 digits so the value always fits in a Postgres int4.
 */
export function parseShortCode(q: string): number | null {
  const m = /^#?(\d{1,9})$/.exec(q.trim());
  return m ? Number(m[1]) : null;
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
