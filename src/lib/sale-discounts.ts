export function isValidUnitDiscount(unitPrice: number, unitDiscount: number): boolean {
  return (
    Number.isFinite(unitPrice) &&
    Number.isFinite(unitDiscount) &&
    unitPrice >= 0 &&
    unitDiscount >= 0 &&
    unitDiscount <= unitPrice
  );
}
