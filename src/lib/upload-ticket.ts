import { SignJWT, jwtVerify } from "jose";

// A short-lived, signed ticket that lets a *separate device* (a phone) upload one
// ID image without logging in. The phone has no session cookie, so the QR carries
// this token instead; it is signed with the same AUTH_SECRET and expires quickly.
// Edge-safe (no next/headers) so it works in both route handlers and the proxy.

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me",
);

const TTL = "10m";

export type UploadTicket = { jti: string; folder: string };

export async function signUploadTicket(folder: string): Promise<{ token: string; jti: string }> {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ folder })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret);
  return { token, jti };
}

export async function verifyUploadTicket(token: string): Promise<UploadTicket | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.jti) return null;
    return { jti: payload.jti, folder: (payload.folder as string) || "nic" };
  } catch {
    return null;
  }
}

/** Storage key of the rendezvous marker the phone writes and the laptop polls. */
export function ticketMarkerKey(jti: string): string {
  return `scan-tickets/${jti}.json`;
}
