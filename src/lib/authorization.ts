import type { Role } from "./session";

export type ActionAccess = "SIGNED_IN" | "ADMIN";

export function roleCanAccess(role: Role, access: ActionAccess): boolean {
  return access === "SIGNED_IN" || role === "ADMIN";
}
