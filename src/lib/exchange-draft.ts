// Hand-off from the return screen to the POS for an exchange. Nothing is saved
// until the cashier completes the new sale, which records the return and the
// sale together — so an abandoned exchange leaves no half-finished records.

export const EXCHANGE_DRAFT_KEY = "madagama:exchange";

export type ExchangeDraft = {
  invoiceId: string;
  invoiceNumber: string;
  customer: { id: string; name: string; phone: string; nic: string | null } | null;
  reason: string;
  lines: { productId: string; name: string; qty: number; restock: boolean; value: number }[];
  /** Estimated credit towards the new sale; the server recalculates it. */
  credit: number;
};

export function saveExchangeDraft(draft: ExchangeDraft): boolean {
  try {
    localStorage.setItem(EXCHANGE_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readExchangeDraft(): ExchangeDraft | null {
  try {
    const raw = localStorage.getItem(EXCHANGE_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ExchangeDraft;
    return draft?.invoiceId && Array.isArray(draft.lines) && draft.lines.length > 0 ? draft : null;
  } catch {
    return null;
  }
}

export function clearExchangeDraft(): void {
  try {
    localStorage.removeItem(EXCHANGE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
