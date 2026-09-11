import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Retry the entire read/validate/write operation with fresh database state. */
export async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}
