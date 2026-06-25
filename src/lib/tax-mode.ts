import type { Prisma } from "@prisma/client";
import { getSettings } from "@/lib/settings";

/**
 * The non-taxable kill-switch.
 *
 * When an admin turns non-taxable OFF (`nonTaxableEnabled = false`), the whole
 * system behaves as if only taxable products and invoices exist: non-taxable
 * records are hidden from every read and can't be created. Nothing is ever
 * deleted — flipping it back ON makes everything reappear. Defaults to ON
 * (`true`) so existing behavior is preserved.
 *
 * Reads through the cached `getSettings()` so it adds no extra DB round-trip
 * within a render.
 */
export async function nonTaxableEnabled(): Promise<boolean> {
  const s = await getSettings();
  return s?.nonTaxableEnabled ?? true;
}

/**
 * Product `where` filter. When the switch is off, only taxable products are
 * visible; when on, no constraint is added (spread an empty object).
 */
export function productTaxableWhere(enabled: boolean): Prisma.ProductWhereInput {
  return enabled ? {} : { taxable: true };
}

/**
 * Invoice `where` filter. When the switch is off, only taxable invoices are
 * visible; when on, no constraint is added. Also usable on relations, e.g.
 * `invoice: { ...invoiceTaxableWhere(enabled) }`.
 */
export function invoiceTaxableWhere(enabled: boolean): Prisma.InvoiceWhereInput {
  return enabled ? {} : { taxCategory: "TAXABLE" };
}
