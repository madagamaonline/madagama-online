import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { canAccessStaffFinance, defaultLandingPath, roleCanAccess } from "./authorization";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  type SessionUser,
} from "./session";

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;

  // The database is authoritative so role changes and deactivation take effect
  // immediately, rather than when the seven-day cookie eventually expires.
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user?.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/** Like requireUser, but also requires the ADMIN role. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** Protect pages that salespeople must not access. */
export async function requireStaffFinanceAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccessStaffFinance(user.role)) redirect(defaultLandingPath(user.role));
  return user;
}

/** Authenticate a directly-invokable Server Action without redirect control flow. */
export async function requireActionUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/** Authorize an ADMIN-only Server Action. */
export async function requireActionAdmin(): Promise<SessionUser> {
  const user = await requireActionUser();
  if (!roleCanAccess(user.role, "ADMIN")) throw new Error("Forbidden");
  return user;
}

/** Protect staff-and-finance Server Actions from direct invocation. */
export async function requireActionStaffFinanceAccess(): Promise<SessionUser> {
  const user = await requireActionUser();
  if (!canAccessStaffFinance(user.role)) throw new Error("Forbidden");
  return user;
}

export async function setSession(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
