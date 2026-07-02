import { SignJWT, jwtVerify } from "jose";

// Edge-safe session helpers (no next/headers import) so they can be used in
// both middleware (edge runtime) and server components / route handlers.

export const SESSION_COOKIE = "madagama_session";

// In production a missing AUTH_SECRET must be a hard failure: falling back to a
// known string would let anyone forge an admin session cookie.
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET is not set — refusing to start with a forgeable session secret.");
}
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me",
);

export type Role = "ADMIN" | "STAFF";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
