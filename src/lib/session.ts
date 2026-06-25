import { SignJWT, jwtVerify } from "jose";

// Edge-safe session helpers (no next/headers import) so they can be used in
// both middleware (edge runtime) and server components / route handlers.

export const SESSION_COOKIE = "madagama_session";

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
