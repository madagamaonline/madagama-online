import type { Prisma, TaxCategory } from "@prisma/client";

/**
 * Sequential invoice number, with a separate series per tax category —
 * mirroring the two physical bill books. Call inside a transaction.
 *   TAXABLE     -> TX-000001
 *   NON_TAXABLE -> NT-000001
 */
export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  category: TaxCategory,
): Promise<string> {
  const prefix = category === "TAXABLE" ? "TX-" : "NT-";
  const count = await tx.invoice.count({ where: { taxCategory: category } });
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}
