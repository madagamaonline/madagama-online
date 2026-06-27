"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, verifyPassword } from "@/lib/auth";

export type ResetState = { error?: string; ok?: boolean; cleared?: number };

// Must match the phrase the user types in the confirmation box. Kept in sync
// with the same literal in `system-reset.tsx` (a "use server" module can only
// export async functions, so it can't be shared as a const).
const CONFIRM_PHRASE = "DELETE ALL DATA";

/**
 * Nuclear "system cleanup": wipes ALL transactional / business data while
 * preserving login accounts (`User`), app configuration (`Setting`) and
 * Prisma's migration history (`_prisma_migrations`).
 *
 * Guarded three ways: (1) ADMIN session re-checked here (a server action is
 * just a POST endpoint), (2) the admin must re-type a confirmation phrase, and
 * (3) the admin must re-enter their own password — important because a 4-digit
 * till PIN can switch into an admin session, so we don't trust the session
 * alone for an irreversible action.
 */
export async function resetSystemData(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") {
    return { error: "Only an admin can perform a system cleanup." };
  }

  const phrase = ((formData.get("confirmPhrase") as string | null) ?? "").trim();
  if (phrase !== CONFIRM_PHRASE) {
    return { error: `Type "${CONFIRM_PHRASE}" exactly to confirm.` };
  }

  const password = (formData.get("password") as string | null) ?? "";
  if (!password) return { error: "Enter your password to confirm." };

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return { error: "Account not found — please sign in again." };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect password." };
  }

  // Discover every table to wipe — everything in the public schema except the
  // keep-list. Doing it dynamically means tables added by future migrations are
  // covered automatically without touching this code.
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('User', 'Setting', '_prisma_migrations')
  `;
  const tables = rows.map((r) => r.tablename);
  if (tables.length === 0) return { ok: true, cleared: 0 };

  // One TRUNCATE clears them all atomically and resets identity sequences.
  // CASCADE only pulls in tables that reference the truncated ones; `User` and
  // `Setting` have no outgoing FKs into this set, so they are never touched.
  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

  // Everything the app reads is now empty — refresh the major surfaces.
  for (const path of [
    "/dashboard",
    "/products",
    "/customers",
    "/invoices",
    "/credit",
    "/purchases",
    "/suppliers",
    "/employees",
    "/payroll",
    "/expenses",
    "/reports",
    "/services",
    "/returns",
    "/settings",
  ]) {
    revalidatePath(path);
  }

  return { ok: true, cleared: tables.length };
}
