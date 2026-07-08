/** Human label for SalesReturn.method — shared by the returns list and invoice detail. */
export function returnMethodLabel(method: string): string {
  return method === "CREDIT_BALANCE"
    ? "Credited to balance"
    : method === "CREDIT_NOTE"
      ? "Credit note"
      : method === "EXCHANGE"
        ? "Exchange"
        : "Cash";
}
