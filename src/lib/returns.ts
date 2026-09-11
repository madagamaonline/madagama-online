import { formatLKR, toNum } from "./utils";

/** Human label for SalesReturn.method — shared by the returns list and invoice detail. */
export function returnMethodLabel(method: string): string {
  return method === "MIXED" ? "Cash and balance credit" : method === "CREDIT_BALANCE"
    ? "Credited to balance"
    : method === "CREDIT_NOTE"
      ? "Credit note"
      : method === "EXCHANGE"
        ? "Exchange"
        : "Cash";
}

/** Preserve legacy reporting; never infer an unrecorded historical cash payout. */
export function cashRefundAmount(ret: { method: string; totalRefund: unknown; cashRefund?: unknown }): number {
  if (ret.cashRefund != null) return toNum(ret.cashRefund as Parameters<typeof toNum>[0]);
  return ret.method === "CASH" ? toNum(ret.totalRefund as Parameters<typeof toNum>[0]) : 0;
}

export function returnSettlementLabel(ret: { method: string; totalRefund: unknown; cashRefund?: unknown; balanceCredit?: unknown }): string {
  if (ret.cashRefund != null && ret.balanceCredit != null && Number(ret.cashRefund) > 0 && Number(ret.balanceCredit) > 0) {
    return `${formatLKR(Number(ret.cashRefund))} cash · ${formatLKR(Number(ret.balanceCredit))} balance credit`;
  }
  return returnMethodLabel(ret.method);
}
