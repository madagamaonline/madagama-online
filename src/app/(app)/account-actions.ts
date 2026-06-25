"use server";

import { prisma } from "@/lib/prisma";
import { getSession, setSession } from "@/lib/auth";

export type LoginUserInfo = {
  id: string;
  name: string;
  role: "ADMIN" | "STAFF";
  hasPin: boolean;
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
    isCurrent: u.id === me.id,
  }));
}

export type SwitchResult = { ok: true } | { ok: false; error: string };

/**
 * Switch the active session to another login account, gated by that account's
 * 4-digit PIN. Lets a family member take over the till without a full logout.
 */
export async function switchUser(userId: string, pin: string): Promise<SwitchResult> {
  const me = await getSession();
  if (!me) return { ok: false, error: "Not logged in." };
  if (userId === me.id) return { ok: true };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, active: true, pin: true },
  });
  if (!user || !user.active) return { ok: false, error: "User not found or inactive." };
  if (!user.pin) return { ok: false, error: "This user has no quick-switch PIN set." };
  if (user.pin !== pin) return { ok: false, error: "Incorrect PIN." };

  await setSession({ id: user.id, name: user.name, email: user.email, role: user.role });
  return { ok: true };
}
