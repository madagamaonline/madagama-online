"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionAdmin, requireActionStaffFinanceAccess, requireActionUser } from "@/lib/auth";
import {
  applyLolcReceiptCreate,
  applyLolcReceiptTransition,
  normalizeLolcPhone,
  parseSriLankaBusinessDate,
  parseSriLankaDateTime,
} from "@/lib/lolc-receipts";
import { prisma } from "@/lib/prisma";

export type LolcActionState = { error?: string; success?: boolean };

const shortText = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const keySchema = z.string().uuid("Refresh the page and try again");

const createSchema = z.object({
  submissionKey: keySchema,
  customerName: shortText("Customer name", 160),
  customerPhone: shortText("Phone number", 30),
  lolcCode: shortText("LOLC code", 100),
  amount: z.coerce.number().finite().positive("Amount must be greater than zero").max(9999999999.99),
  collectedDate: shortText("Collection date", 10),
  note: optionalText(500),
});

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function parseOccurred(value: string, label: string): Date {
  const date = parseSriLankaDateTime(value, label);
  if (date.getTime() > Date.now() + 5 * 60_000) throw new Error(`${label} cannot be in the future`);
  return date;
}

function mutationError(error: unknown, fallback: string): LolcActionState {
  if (error instanceof Error && (
    error.message.includes("Receipt not found") ||
    error.message.includes("has changed") ||
    error.message.includes("cannot be before") ||
    error.message.includes("duplicate submission")
  )) {
    return { error: error.message };
  }
  console.error(fallback, error);
  return { error: fallback };
}

function revalidateLolc(id: string) {
  revalidatePath("/lolc-receipt");
  revalidatePath(`/lolc-receipt/${id}`);
  revalidatePath(`/lolc-receipt/${id}/print`);
}

export async function createLolcReceipt(
  _previous: LolcActionState,
  formData: FormData,
): Promise<LolcActionState> {
  const user = await requireActionUser();
  const parsed = createSchema.safeParse({
    submissionKey: field(formData, "submissionKey"),
    customerName: field(formData, "customerName"),
    customerPhone: field(formData, "customerPhone"),
    lolcCode: field(formData, "lolcCode"),
    amount: field(formData, "amount"),
    collectedDate: field(formData, "collectedDate"),
    note: field(formData, "note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the receipt details" };

  let customerPhone: string;
  let collectedAt: Date;
  try {
    customerPhone = normalizeLolcPhone(parsed.data.customerPhone);
    collectedAt = parseSriLankaBusinessDate(parsed.data.collectedDate);
    if (collectedAt.getTime() > Date.now() + 18_000_000) throw new Error("Collection date cannot be in the future");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Check the receipt details" };
  }

  let receiptId: string | undefined;
  try {
    const receipt = await prisma.$transaction(
      (tx) => applyLolcReceiptCreate(tx, {
        submissionKey: parsed.data.submissionKey,
        customerName: parsed.data.customerName,
        customerPhone,
        lolcCode: parsed.data.lolcCode,
        amount: parsed.data.amount,
        collectedAt,
        note: parsed.data.note,
        actorUserId: user.id,
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    receiptId = receipt.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      receiptId = (await prisma.lolcReceipt.findUnique({
        where: { submissionKey: parsed.data.submissionKey },
        select: { id: true },
      }))?.id;
    }
    if (!receiptId) return mutationError(error, "Could not save the LOLC receipt. Please try again.");
  }

  revalidatePath("/lolc-receipt");
  redirect(`/lolc-receipt/${receiptId}`);
}

const remitSchema = z.object({
  idempotencyKey: keySchema,
  reference: shortText("mCash reference", 120),
  occurredAt: shortText("sent date and time", 16),
});

export async function markLolcReceiptSent(id: string, _previous: LolcActionState, formData: FormData): Promise<LolcActionState> {
  const user = await requireActionStaffFinanceAccess();
  const parsed = remitSchema.safeParse({
    idempotencyKey: field(formData, "idempotencyKey"),
    reference: field(formData, "reference"),
    occurredAt: field(formData, "occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the mCash details" };
  try {
    const occurredAt = parseOccurred(parsed.data.occurredAt, "sent date and time");
    await prisma.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId: id,
      expectedStatuses: ["COLLECTED"],
      toStatus: "MCASH_SENT",
      eventType: "MCASH_SENT",
      occurredAt,
      actorUserId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
      reference: parsed.data.reference,
      update: { mCashReference: parsed.data.reference, remittedAt: occurredAt, remittedByUserId: user.id, issueNote: null },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateLolc(id);
    return { success: true };
  } catch (error) {
    return mutationError(error, "Could not record the mCash transfer.");
  }
}

const issueSchema = z.object({ idempotencyKey: keySchema, note: shortText("Issue note", 1000) });

export async function reportLolcReceiptIssue(id: string, _previous: LolcActionState, formData: FormData): Promise<LolcActionState> {
  const user = await requireActionStaffFinanceAccess();
  const parsed = issueSchema.safeParse({ idempotencyKey: field(formData, "idempotencyKey"), note: field(formData, "note") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Describe the issue" };
  try {
    const occurredAt = new Date();
    await prisma.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId: id,
      expectedStatuses: ["MCASH_SENT"],
      toStatus: "NEEDS_ATTENTION",
      eventType: "ISSUE_REPORTED",
      occurredAt,
      actorUserId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
      note: parsed.data.note,
      update: { issueNote: parsed.data.note },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateLolc(id);
    return { success: true };
  } catch (error) {
    return mutationError(error, "Could not report the issue.");
  }
}

const confirmSchema = z.object({
  idempotencyKey: keySchema,
  reference: optionalText(120),
  note: optionalText(1000),
  occurredAt: shortText("confirmation date and time", 16),
}).refine((data) => Boolean(data.reference || data.note), { message: "Enter an LOLC reference or a verification note" });

export async function confirmLolcReceipt(id: string, _previous: LolcActionState, formData: FormData): Promise<LolcActionState> {
  const user = await requireActionStaffFinanceAccess();
  const parsed = confirmSchema.safeParse({
    idempotencyKey: field(formData, "idempotencyKey"),
    reference: field(formData, "reference") || undefined,
    note: field(formData, "note") || undefined,
    occurredAt: field(formData, "occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the confirmation details" };
  try {
    const occurredAt = parseOccurred(parsed.data.occurredAt, "confirmation date and time");
    await prisma.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId: id,
      expectedStatuses: ["MCASH_SENT", "NEEDS_ATTENTION"],
      toStatus: "LOLC_CONFIRMED",
      eventType: "LOLC_CONFIRMED",
      occurredAt,
      actorUserId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
      reference: parsed.data.reference,
      note: parsed.data.note,
      update: {
        lolcConfirmationReference: parsed.data.reference || null,
        confirmedAt: occurredAt,
        confirmedByUserId: user.id,
        issueNote: null,
      },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateLolc(id);
    return { success: true };
  } catch (error) {
    return mutationError(error, "Could not confirm the LOLC payment.");
  }
}

const voidSchema = z.object({ idempotencyKey: keySchema, reason: shortText("Void reason", 1000) });

export async function voidLolcReceipt(id: string, _previous: LolcActionState, formData: FormData): Promise<LolcActionState> {
  const user = await requireActionAdmin();
  const parsed = voidSchema.safeParse({ idempotencyKey: field(formData, "idempotencyKey"), reason: field(formData, "reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a void reason" };
  try {
    const occurredAt = new Date();
    await prisma.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId: id,
      expectedStatuses: ["COLLECTED", "MCASH_SENT", "NEEDS_ATTENTION", "LOLC_CONFIRMED"],
      toStatus: "VOIDED",
      eventType: "VOIDED",
      occurredAt,
      actorUserId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
      note: parsed.data.reason,
      update: { voidReason: parsed.data.reason, voidedAt: occurredAt, voidedByUserId: user.id },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateLolc(id);
    return { success: true };
  } catch (error) {
    return mutationError(error, "Could not void the receipt.");
  }
}
