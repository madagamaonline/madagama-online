import type {
  LolcReceiptEventType,
  LolcReceiptStatus,
  Prisma,
} from "@prisma/client";
import { validateLkPhone } from "@/lib/phone";

// This module is intentionally isolated from invoices, payments, stock, shifts,
// and every other accounting model. LOLC money is custodial, not business income.

export const LOLC_STATUSES: LolcReceiptStatus[] = [
  "COLLECTED",
  "MCASH_SENT",
  "NEEDS_ATTENTION",
  "LOLC_CONFIRMED",
  "VOIDED",
];

export const LOLC_OPEN_STATUSES: LolcReceiptStatus[] = [
  "COLLECTED",
  "MCASH_SENT",
  "NEEDS_ATTENTION",
];

const labels: Record<LolcReceiptStatus, string> = {
  COLLECTED: "Waiting to send",
  MCASH_SENT: "Waiting for LOLC",
  NEEDS_ATTENTION: "Needs attention",
  LOLC_CONFIRMED: "Confirmed",
  VOIDED: "Voided",
};

export function lolcReceiptNumber(value: number): string {
  return `LOLC-${String(value).padStart(6, "0")}`;
}

export function lolcStatusLabel(status: LolcReceiptStatus): string {
  return labels[status];
}

export function lolcStatusTone(status: LolcReceiptStatus): "amber" | "blue" | "red" | "green" | "gray" {
  if (status === "COLLECTED") return "amber";
  if (status === "MCASH_SENT") return "blue";
  if (status === "NEEDS_ATTENTION") return "red";
  if (status === "LOLC_CONFIRMED") return "green";
  return "gray";
}

export function canTransitionLolcReceipt(from: LolcReceiptStatus, to: LolcReceiptStatus): boolean {
  if (to === "VOIDED") return from !== "VOIDED";
  if (from === "COLLECTED") return to === "MCASH_SENT";
  if (from === "MCASH_SENT") return to === "NEEDS_ATTENTION" || to === "LOLC_CONFIRMED";
  if (from === "NEEDS_ATTENTION") return to === "LOLC_CONFIRMED";
  return false;
}

export function normalizeLolcPhone(raw: string): string {
  const checked = validateLkPhone(raw);
  if (!checked.ok) throw new Error(checked.error);
  return checked.normalized;
}

export function parseSriLankaBusinessDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid collection date");
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new Error("Enter a valid collection date");
  return date;
}

export function parseSriLankaDateTime(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error(`Enter a valid ${label}`);
  const date = new Date(`${value}:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new Error(`Enter a valid ${label}`);
  return date;
}

export function ageInDays(date: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

export type CreateLolcReceiptInput = {
  submissionKey: string;
  customerName: string;
  customerPhone: string;
  lolcCode: string;
  amount: Prisma.Decimal | number | string;
  collectedAt: Date;
  note?: string | null;
  actorUserId: string;
};

export async function applyLolcReceiptCreate(tx: Prisma.TransactionClient, input: CreateLolcReceiptInput) {
  const receipt = await tx.lolcReceipt.create({
    data: {
      submissionKey: input.submissionKey,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      lolcCode: input.lolcCode,
      amount: input.amount,
      collectedAt: input.collectedAt,
      note: input.note || null,
      createdByUserId: input.actorUserId,
    },
  });
  await tx.lolcReceiptEvent.create({
    data: {
      receiptId: receipt.id,
      type: "CREATED",
      toStatus: "COLLECTED",
      occurredAt: receipt.createdAt,
      actorUserId: input.actorUserId,
      idempotencyKey: `create:${input.submissionKey}`,
    },
  });
  return receipt;
}

type TransitionInput = {
  receiptId: string;
  expectedStatuses: LolcReceiptStatus[];
  toStatus: LolcReceiptStatus;
  eventType: LolcReceiptEventType;
  occurredAt: Date;
  actorUserId: string;
  idempotencyKey: string;
  reference?: string | null;
  note?: string | null;
  update: Prisma.LolcReceiptUncheckedUpdateManyInput;
};

export async function applyLolcReceiptTransition(tx: Prisma.TransactionClient, input: TransitionInput) {
  const replay = await tx.lolcReceiptEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { receiptId: true },
  });
  if (replay) {
    if (replay.receiptId !== input.receiptId) throw new Error("Invalid duplicate submission");
    return;
  }
  const prior = await tx.lolcReceipt.findUnique({
    where: { id: input.receiptId },
    select: { status: true, collectedAt: true, remittedAt: true },
  });
  if (!prior) throw new Error("Receipt not found");
  if (!input.expectedStatuses.includes(prior.status) || !canTransitionLolcReceipt(prior.status, input.toStatus)) {
    throw new Error("This receipt has changed. Refresh the page and try again.");
  }
  if (input.occurredAt < prior.collectedAt) throw new Error("The checkpoint date cannot be before the collection date");
  if (input.toStatus === "LOLC_CONFIRMED" && prior.remittedAt && input.occurredAt < prior.remittedAt) {
    throw new Error("The confirmation date cannot be before the mCash sent date");
  }
  const changed = await tx.lolcReceipt.updateMany({
    where: { id: input.receiptId, status: { in: input.expectedStatuses } },
    data: { ...input.update, status: input.toStatus },
  });
  if (changed.count !== 1) throw new Error("This receipt has changed. Refresh the page and try again.");
  await tx.lolcReceiptEvent.create({
    data: {
      receiptId: input.receiptId,
      type: input.eventType,
      fromStatus: prior.status,
      toStatus: input.toStatus,
      reference: input.reference || null,
      note: input.note || null,
      occurredAt: input.occurredAt,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
    },
  });
}
