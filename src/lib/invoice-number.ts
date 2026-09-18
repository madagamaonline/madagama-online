import type { Prisma, TaxCategory } from "@prisma/client";

/**
 * Numeric-only public invoice reference. The PostgreSQL sequence makes number
 * allocation safe across concurrent cash, credit and layaway transactions.
 * The last digit is the private billing-series code:
 *   TAXABLE     -> ...2
 *   NON_TAXABLE -> ...7
 *
 * Historical TX-/NT-prefixed references remain stored unchanged. Call this
 * inside the surrounding invoice transaction.
 */
export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  category: TaxCategory,
): Promise<string> {
  const seriesDigit = category === "TAXABLE" ? "2" : "7";

  // A pre-existing deployment may already contain manually-entered numeric
  // references. Skip any collision without rewriting historical rows.
  for (let attempt = 0; attempt < 1_000; attempt++) {
    const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('invoice_public_sequence') AS value
    `;
    const value = rows[0]?.value;
    if (value === undefined) throw new Error("Invoice sequence returned no value.");
    const candidate = `${value.toString().padStart(6, "0")}${seriesDigit}`;
    const existing = await tx.invoice.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new Error("Could not allocate a unique invoice number.");
}
