import type { Role } from "./session";

export type ActionAccess = "SIGNED_IN" | "ADMIN";

export function roleCanAccess(role: Role, access: ActionAccess): boolean {
  return access === "SIGNED_IN" || role === "ADMIN";
}

/** Staff-and-finance screens are available to admins and cashiers, not salespeople. */
export function canAccessStaffFinance(role: Role): boolean {
  return role !== "SALESPERSON";
}

export function defaultLandingPath(role: Role): "/dashboard" | "/invoices/new" {
  return role === "SALESPERSON" ? "/invoices/new" : "/dashboard";
}
