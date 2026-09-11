"use server";

import { prisma } from "@/lib/prisma";
import { reserveSwitchAttempt, releaseSuccessfulSwitchAttempt } from "@/lib/auth-attempts";
import { getSession, setSession, verifyPassword } from "@/lib/auth";
import type { Role } from "@/lib/session";

export type LoginUserInfo = {
  id: string;
  name: string;
  role: Role;
  hasPin: boolean;
  requiresPassword: boolean;
  isCurrent: boolean;
};

/** Active login accounts (family members) for the quick-switch menu. */
export async function getActiveLoginUsers(): Promise<LoginUserInfo[]> {
  const me = await getSession();
  if (!me) return [];
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, pin: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    hasPin: !!u.pin,
    requiresPassword: u.role === "ADMIN",
    isCurrent: u.id === me.id,
  }));
}

export type SwitchResult = { ok: true } | { ok: false; error: string };

/**
 * Switch the active session to another login account, gated by that account's
 * PIN, or full password for administrators. Attempts are shared across instances.
 */
export async function switchUser(userId: string, credential: string): Promise<SwitchResult> {
  const me = await getSession();
  if (!me) return { ok: false, error: "Not logged in." };
  if (typeof userId !== "string" || userId.length > 128 || !userId || typeof credential !== "string" || credential.length > 1024) return { ok: false, error: "Invalid account credentials." };
  if (userId === me.id) return { ok: true };

  let ticket;
  try { ticket = await reserveSwitchAttempt(userId); }
  catch { return { ok: false, error: "Account switching is temporarily unavailable. Please sign in normally." }; }
  if (!ticket) return { ok: false, error: "Too many attempts. Try again in 15 minutes or sign in normally." };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, active: true, pin: true, passwordHash: true },
  });
  if (!user || !user.active) return { ok: false, error: "User not found or inactive." };
  if (user.role === "ADMIN") {
    if (!(await verifyPassword(credential, user.passwordHash))) return { ok: false, error: "Incorrect password." };
  } else {
    if (!user.pin) return { ok: false, error: "This user has no quick-switch PIN set." };
    if (!/^\d{4}$/.test(credential) || user.pin !== credential) return { ok: false, error: "Incorrect PIN." };
  }
  await releaseSuccessfulSwitchAttempt(ticket);

  await setSession({ id: user.id, name: user.name, email: user.email, role: user.role });
  return { ok: true };
}
