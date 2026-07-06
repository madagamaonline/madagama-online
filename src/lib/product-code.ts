import type { Prisma } from "@prisma/client";

/**
 * Builds a human-readable product code: CATEGORY-SUBCATEGORY-NNNN
 * e.g. ("AGR", "TOOL", 1) -> "AGR-TOOL-0001". When there is no subcategory the
 * middle segment is dropped: ("AGR", null, 1) -> "AGR-0001".
 */
export function buildProductCode(
  categoryCode: string,
  subcategoryCode: string | null,
  seq: number,
): string {
  const prefix = subcategoryCode ? `${categoryCode}-${subcategoryCode}` : categoryCode;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
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
 * Atomically reserves the next sequence number and returns the resulting
 * product code. Subcategorised products draw their sequence from the
 * subcategory (CAT-SUB-NNNN); products with no subcategory draw it from the
 * category itself (CAT-NNNN). Must run inside a transaction so concurrent
 * product creation never produces duplicate codes.
 */
export async function nextProductCode(
  tx: Prisma.TransactionClient,
  categoryId: string,
  subcategoryId?: string | null,
): Promise<string> {
  if (subcategoryId) {
    const sub = await tx.subcategory.update({
      where: { id: subcategoryId },
      data: { seq: { increment: 1 } },
      include: { category: true },
    });
    return buildProductCode(sub.category.code, sub.code, sub.seq);
  }
  const cat = await tx.category.update({
    where: { id: categoryId },
    data: { seq: { increment: 1 } },
  });
  return buildProductCode(cat.code, null, cat.seq);
}
