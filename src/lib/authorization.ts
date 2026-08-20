import type { Role } from "./session";

export type ActionAccess = "SIGNED_IN" | "ADMIN";

export function roleCanAccess(role: Role, access: ActionAccess): boolean {
  return access === "SIGNED_IN" || role === "ADMIN";
}

/** Staff-and-finance screens are available to admins and cashiers, not salespeople. */
export function canAccessStaffFinance(role: Role): boolean {
  return role !== "SALESPERSON";
}

/** Cancelling an issued cheque is an audited correction reserved for administrators. */
export function canVoidCheque(role: Role): boolean {
  return roleCanAccess(role, "ADMIN");
}

/** Every signed-in role that can create a sale may also offer Pay Later. */
export function canCreatePayLaterSale(role: Role): boolean {
  return roleCanAccess(role, "SIGNED_IN");
}

export function defaultLandingPath(role: Role): "/dashboard" | "/invoices/new" {
  return role === "SALESPERSON" ? "/invoices/new" : "/dashboard";
}
