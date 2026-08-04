import type { InventoryTracking, UnitOfMeasure } from "@prisma/client";

export const LENGTH_UNITS = ["METER", "CENTIMETER", "MILLIMETER", "FOOT", "INCH"] as const;

export type QuantityUnit = UnitOfMeasure;

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  EACH: "each",
  METER: "m",
  CENTIMETER: "cm",
  MILLIMETER: "mm",
  FOOT: "ft",
  INCH: "in",
};

const METERS_PER_UNIT: Record<Exclude<UnitOfMeasure, "EACH">, number> = {
  METER: 1,
  CENTIMETER: 0.01,
  MILLIMETER: 0.001,
  FOOT: 0.3048,
  INCH: 0.0254,
};

export function unitsForTracking(tracking: InventoryTracking): UnitOfMeasure[] {
  return tracking === "LENGTH" ? [...LENGTH_UNITS] : ["EACH"];
}

export function canonicalUnit(tracking: InventoryTracking): UnitOfMeasure {
  return tracking === "LENGTH" ? "METER" : "EACH";
}

export function isUnitAllowed(tracking: InventoryTracking, unit: UnitOfMeasure): boolean {
  return unitsForTracking(tracking).includes(unit);
}

/** Convert a data-entry quantity to canonical stock (EACH or metres). */
export function toCanonicalQuantity(
  quantity: number,
  unit: UnitOfMeasure,
  tracking: InventoryTracking,
): number {
  if (!Number.isFinite(quantity)) return Number.NaN;
  if (!isUnitAllowed(tracking, unit)) return Number.NaN;
  if (tracking === "PIECE") return quantity;
  return roundQuantity(quantity * METERS_PER_UNIT[unit as Exclude<UnitOfMeasure, "EACH">]);
}

export function fromCanonicalQuantity(
  quantity: number,
  unit: UnitOfMeasure,
  tracking: InventoryTracking,
): number {
  if (!isUnitAllowed(tracking, unit)) return Number.NaN;
  if (tracking === "PIECE") return quantity;
  return roundQuantity(quantity / METERS_PER_UNIT[unit as Exclude<UnitOfMeasure, "EACH">]);
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export function formatQuantity(value: number, unit: UnitOfMeasure = "EACH"): string {
  const digits = unit === "EACH" ? 0 : 4;
  const text = new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
  return unit === "EACH" ? text : `${text} ${UNIT_LABELS[unit]}`;
}

export function formatEnteredQuantity(
  canonicalQty: number,
  canonical: UnitOfMeasure,
  enteredQty?: number | null,
  enteredUnit?: UnitOfMeasure | null,
): string {
  if (enteredQty != null && enteredUnit) {
    const entered = formatQuantity(enteredQty, enteredUnit);
    const base = formatQuantity(canonicalQty, canonical);
    return enteredUnit === canonical ? entered : `${entered} (${base})`;
  }
  return formatQuantity(canonicalQty, canonical);
}
