import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reuse a single client across the process in every environment. On serverless
// (Vercel) this keeps the connection warm between invocations instead of opening
// a fresh Neon connection on every render.
globalForPrisma.prisma = prisma;
