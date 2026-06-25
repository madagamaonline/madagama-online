import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Global settings (single row, id = 1). Wrapped in React `cache` so that every
 * component in the same render shares one DB round-trip instead of each one
 * issuing its own `findUnique` to Neon. Returns `null` only if the row was never
 * seeded.
 */
export const getSettings = cache(async () => {
  return prisma.setting.findUnique({ where: { id: 1 } });
});
