import type { Prisma } from "@prisma/client";

/**
 * Sequential service-job number, e.g. SVC-000001. Call inside a transaction so
 * concurrent creates can't mint the same number; the caller retries on the
 * unique-constraint conflict (P2002) to pick up the next one.
 */
export async function generateServiceJobNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.serviceJob.count();
  return `SVC-${String(count + 1).padStart(6, "0")}`;
}
