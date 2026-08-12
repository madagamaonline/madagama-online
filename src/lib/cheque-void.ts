import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { chequeBalance, VOID_KINDS, type ChequeVoidKind } from "@/lib/cheques";
import { round2, toNum } from "@/lib/utils";

export const voidChequeSchema = z.object({
  chequeId: z.string().min(1, "Cheque is required."),
  kind: z.enum(VOID_KINDS),
  voidedDate: z.string().min(1, "Choose the date the cheque was stopped."),
  reason: z
    .string()
    .trim()
    .min(3, "Please enter a reason of at least 3 characters.")
    .max(500, "Reason must be 500 characters or fewer."),
});

export const clearChequeSchema = z.object({
  chequeId: z.string().min(1, "Cheque is required."),
  clearedDate: z.string().min(1, "Choose the date the cheque cleared."),
  note: z.string().trim().max(500, "Note must be 500 characters or fewer.").optional(),
});

export class ChequeLifecycleError extends Error {}

export type ChequeVoidEligibility = {
  alreadyVoided: boolean;
  cleared: boolean;
  hasReplacement: boolean;
};

export function chequeVoidEligibilityError(e: ChequeVoidEligibility): string | null {
  if (e.alreadyVoided) return "This cheque has already been stopped, bounced or cancelled.";
  if (e.cleared) return "This cheque has already cleared the bank and can no longer be stopped.";
  if (e.hasReplacement) return "This cheque has already been replaced by a newer cheque.";
  return null;
}

/**
 * The supplier balance to hand back when a cheque dies.
 *
 * Only the part the supplier never actually received in cleared funds comes back.
 * Capped at what the purchase currently shows as paid so a purchase can never go
 * negative (e.g. if a supplier return already credited the balance).
 */
export function reversalAmount(remaining: number, purchaseAmountPaid: number): number {
  return Math.max(0, Math.min(round2(remaining), round2(purchaseAmountPaid)));
}

export function purchaseStatusFor(total: number, paid: number): "PAID" | "PARTIAL" | "CREDIT" {
  if (paid >= total) return "PAID";
  return paid > 0 ? "PARTIAL" : "CREDIT";
}

/**
 * Stop / bounce / cancel a cheque.
 *
 * The cheque record itself is frozen, never deleted — the bank statement references
 * its number. The debt it was meant to settle springs back onto the linked purchase
 * as a negative payment row, so the supplier payable is truthful again.
 */
export async function applyChequeVoid(
  tx: Prisma.TransactionClient,
  input: {
    chequeId: string;
    kind: ChequeVoidKind;
    reason: string;
    voidedDate: Date;
    userId: string;
  },
): Promise<{ reversed: number; purchaseId: string | null }> {
  const cheque = await tx.issuedCheque.findUnique({
    where: { id: input.chequeId },
    select: {
      id: true,
      chequeNumber: true,
      amount: true,
      voidedAt: true,
      clearedDate: true,
      purchaseId: true,
      payments: { select: { amount: true } },
      replacedBy: { select: { id: true } },
    },
  });
  if (!cheque) throw new ChequeLifecycleError("Cheque not found.");

  const remaining = chequeBalance(
    toNum(cheque.amount),
    cheque.payments.map((payment) => toNum(payment.amount)),
  );
  const blocker = chequeVoidEligibilityError({
    alreadyVoided: cheque.voidedAt != null,
    cleared: cheque.clearedDate != null || remaining <= 0,
    hasReplacement: cheque.replacedBy != null,
  });
  if (blocker) throw new ChequeLifecycleError(blocker);

  let reversed = 0;
  if (cheque.purchaseId) {
    const purchase = await tx.purchase.findUnique({
      where: { id: cheque.purchaseId },
      select: { id: true, total: true, amountPaid: true },
    });
    if (!purchase) throw new ChequeLifecycleError("The linked purchase no longer exists.");

    reversed = reversalAmount(remaining, toNum(purchase.amountPaid));
    if (reversed > 0) {
      const newPaid = round2(toNum(purchase.amountPaid) - reversed);
      await tx.purchasePayment.create({
        data: {
          purchaseId: purchase.id,
          amount: -reversed,
          paidDate: input.voidedDate,
          note: `Cheque ${cheque.chequeNumber} ${input.kind.toLowerCase()} — supplier balance restored`,
        },
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { amountPaid: newPaid, status: purchaseStatusFor(toNum(purchase.total), newPaid) },
      });
    }
  }

  // Claim the void so two concurrent stops can't both reverse the payable.
  const claimed = await tx.issuedCheque.updateMany({
    where: { id: cheque.id, voidedAt: null },
    data: {
      voidedAt: input.voidedDate,
      voidKind: input.kind,
      voidReason: input.reason,
      voidedByUserId: input.userId,
      reversedAmount: reversed,
    },
  });
  if (claimed.count !== 1) throw new ChequeLifecycleError("This cheque has already been voided.");

  return { reversed, purchaseId: cheque.purchaseId };
}

/**
 * Mark a cheque as cleared by the bank. A cheque clears in full or not at all, so
 * this records the whole remaining amount leaving the bank in one shot.
 */
export async function applyChequeClear(
  tx: Prisma.TransactionClient,
  input: { chequeId: string; clearedDate: Date; note?: string | null },
): Promise<{ cleared: number }> {
  const cheque = await tx.issuedCheque.findUnique({
    where: { id: input.chequeId },
    select: {
      id: true,
      amount: true,
      voidedAt: true,
      clearedDate: true,
      payments: { select: { amount: true } },
    },
  });
  if (!cheque) throw new ChequeLifecycleError("Cheque not found.");
  if (cheque.voidedAt) throw new ChequeLifecycleError("This cheque was stopped and cannot clear.");
  if (cheque.clearedDate) throw new ChequeLifecycleError("This cheque is already marked as cleared.");

  const remaining = chequeBalance(
    toNum(cheque.amount),
    cheque.payments.map((payment) => toNum(payment.amount)),
  );
  if (remaining <= 0) throw new ChequeLifecycleError("This cheque is already fully settled.");

  await tx.chequePayment.create({
    data: {
      issuedChequeId: cheque.id,
      amount: remaining,
      paidDate: input.clearedDate,
      note: input.note?.trim() || "Cleared by bank",
    },
  });
  const claimed = await tx.issuedCheque.updateMany({
    where: { id: cheque.id, clearedDate: null, voidedAt: null },
    data: { clearedDate: input.clearedDate },
  });
  if (claimed.count !== 1) throw new ChequeLifecycleError("This cheque is already marked as cleared.");

  return { cleared: remaining };
}
