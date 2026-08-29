import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

/**
 * Peeks at the sticker code the next product will get, without consuming it.
 * shortCode is a Postgres SERIAL, so the true next value lives in the sequence
 * (max(shortCode) + 1 would be wrong once a product has been deleted). Purely
 * a hint for the "New Product" form — a concurrent create can still take it,
 * so never persist or rely on this value.
 */
export async function peekNextShortCode(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`
      SELECT last_value, is_called FROM "Product_shortCode_seq"
    `;
    const row = rows[0];
    if (!row) return null;
    return Number(row.last_value) + (row.is_called ? 1 : 0);
  } catch {
    return null;
  }
}
