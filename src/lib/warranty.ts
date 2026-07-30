export const WARRANTY_OPTIONS = [
  { value: null, label: "No warranty" },
  { value: 6, label: "6 months" },
  { value: 12, label: "1 year" },
  { value: 24, label: "2 years" },
  { value: 36, label: "3 years" },
  { value: 48, label: "4 years" },
  { value: 60, label: "5 years" },
  { value: 72, label: "6 years" },
  { value: 84, label: "7 years" },
  { value: 96, label: "8 years" },
  { value: 108, label: "9 years" },
  { value: 120, label: "10 years" },
] as const;

export type WarrantyMonths = Exclude<(typeof WARRANTY_OPTIONS)[number]["value"], null>;

export function isValidWarrantyMonths(value: unknown): value is WarrantyMonths | null {
  return (
    value === null ||
    value === 6 ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 12 &&
      value <= 120 &&
      value % 12 === 0)
  );
}

export function normalizeWarrantyMonths(value: unknown): WarrantyMonths | null {
  return isValidWarrantyMonths(value) ? value : null;
}

export function formatWarrantyMonths(value: number): string {
  if (value === 6) return "6 months";
  const years = value / 12;
  return `${years} ${years === 1 ? "year" : "years"}`;
}
