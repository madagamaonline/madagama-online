import type { Prisma } from "@prisma/client";

/**
 * Compatibility shim for the retired non-taxable kill-switch.
 *
 * Tax classification is now permanent and always available. Keep this helper
 * during the rollback window so older call sites cannot hide historical data,
 * even when a live Setting row still contains `nonTaxableEnabled = false`.
 */
export async function nonTaxableEnabled(): Promise<boolean> {
  return true;
}

/** @deprecated Compatibility helper; classification is never a visibility filter. */
export function productTaxableWhere(_enabled: boolean): Prisma.ProductWhereInput {
  void _enabled;
  return {};
}

/** @deprecated Compatibility helper; purchases are always visible. */
export function purchaseTaxableWhere(_enabled: boolean): Prisma.PurchaseWhereInput {
  void _enabled;
  return {};
}

/** @deprecated Compatibility helper; supplier returns are always visible. */
export function supplierReturnTaxableWhere(_enabled: boolean): Prisma.SupplierReturnWhereInput {
  void _enabled;
  return {};
}

/** @deprecated Compatibility helper; invoice category is never a visibility filter. */
export function invoiceTaxableWhere(_enabled: boolean): Prisma.InvoiceWhereInput {
  void _enabled;
  return {};
}

/** Financial/operational reads ignore voided invoices; audit reads do not. */
export function activeInvoiceWhere(_enabled: boolean): Prisma.InvoiceWhereInput {
  void _enabled;
  return { voidedAt: null };
}
