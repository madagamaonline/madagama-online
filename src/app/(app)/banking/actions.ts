"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionStaffFinanceAccess } from "@/lib/auth";
import { chequeBalance, validateChequePayment } from "@/lib/cheques";
import { prisma } from "@/lib/prisma";
import { round2, toNum } from "@/lib/utils";

export type BankingActionState = { error?: string; ok?: boolean; id?: string };

const accountSchema = z.object({
  accountName: z.string().trim().min(1, "Enter an account name"),
  bankName: z.string().trim().min(1, "Enter the bank name"),
  accountNumber: z.string().trim().min(1, "Enter the account number"),
  branch: z.string().trim().optional(),
  overdraftLimit: z.union([z.literal(""), z.coerce.number().nonnegative("Overdraft limit cannot be negative")]).optional(),
  notes: z.string().trim().optional(),
});

export async function createBankAccount(
  _previous: BankingActionState,
  formData: FormData,
): Promise<BankingActionState> {
  await requireActionStaffFinanceAccess();
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the account details" };

  try {
    const account = await prisma.bankAccount.create({
      data: {
        accountName: parsed.data.accountName,
        bankName: parsed.data.bankName,
        accountNumber: parsed.data.accountNumber,
        branch: parsed.data.branch || null,
        overdraftLimit: parsed.data.overdraftLimit === "" || parsed.data.overdraftLimit == null
          ? null
          : parsed.data.overdraftLimit,
        notes: parsed.data.notes || null,
      },
    });
    revalidatePath("/banking");
    return { ok: true, id: account.id };
  } catch (error) {
    console.error("createBankAccount failed", error);
    return { error: "Could not save the bank account. Please try again." };
  }
}

const chequeSchema = z.object({
  bankAccountId: z.string().min(1, "Select a bank account"),
  supplierId: z.string().min(1, "Select a supplier"),
  purchaseId: z.string().optional(),
  chequeNumber: z.string().trim().min(1, "Enter the cheque number"),
  amount: z.coerce.number().positive("Enter a valid cheque amount"),
  issuedDate: z.string().min(1, "Choose the issue date"),
  dueDate: z.string().min(1, "Choose the due date"),
  notes: z.string().trim().optional(),
}).refine((data) => new Date(data.dueDate) >= new Date(data.issuedDate), {
  message: "Due date cannot be before the issue date",
  path: ["dueDate"],
});

export async function issueCheque(
  _previous: BankingActionState,
  formData: FormData,
): Promise<BankingActionState> {
  await requireActionStaffFinanceAccess();
  const parsed = chequeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the cheque details" };
  const data = parsed.data;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cheque = await prisma.$transaction(
        async (tx) => {
          const account = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId } });
          if (!account || !account.active) throw new Error("The selected bank account is not active");

          let purchaseApplied = 0;
          let purchase: { id: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal; supplierId: string } | null = null;
          if (data.purchaseId) {
            purchase = await tx.purchase.findUnique({
              where: { id: data.purchaseId },
              select: { id: true, total: true, amountPaid: true, supplierId: true },
            });
            if (!purchase) throw new Error("The selected purchase no longer exists");
            if (purchase.supplierId !== data.supplierId) throw new Error("The selected purchase belongs to another supplier");
            const purchaseRemaining = round2(toNum(purchase.total) - toNum(purchase.amountPaid));
            if (purchaseRemaining <= 0) throw new Error("The selected purchase is already settled");
            if (round2(data.amount) > purchaseRemaining) {
              throw new Error("Cheque amount cannot exceed the selected purchase balance");
            }
            purchaseApplied = round2(data.amount);
          }

          const created = await tx.issuedCheque.create({
            data: {
              bankAccountId: data.bankAccountId,
              supplierId: data.supplierId,
              purchaseId: data.purchaseId || null,
              chequeNumber: data.chequeNumber,
              amount: round2(data.amount),
              issuedDate: new Date(data.issuedDate),
              dueDate: new Date(data.dueDate),
              notes: data.notes || null,
            },
          });

          if (purchase && purchaseApplied > 0) {
            const newPaid = round2(toNum(purchase.amountPaid) + purchaseApplied);
            const total = toNum(purchase.total);
            await tx.purchasePayment.create({
              data: {
                purchaseId: purchase.id,
                amount: purchaseApplied,
                paidDate: new Date(data.issuedDate),
                note: `Issued cheque ${data.chequeNumber} · ${account.bankName} (${account.accountName})`,
              },
            });
            await tx.purchase.update({
              where: { id: purchase.id },
              data: {
                amountPaid: newPaid,
                status: newPaid >= total ? "PAID" : newPaid > 0 ? "PARTIAL" : "CREDIT",
              },
            });
          }
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );

      revalidatePath("/banking");
      revalidatePath("/purchases");
      revalidatePath("/suppliers");
      revalidatePath("/dashboard");
      revalidatePath("/reminders");
      if (data.purchaseId) revalidatePath(`/purchases/${data.purchaseId}`);
      return { ok: true, id: cheque.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) {
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { error: "That cheque number is already registered for this bank account." };
      }
      console.error("issueCheque failed", error);
      return { error: error instanceof Error ? error.message : "Could not issue the cheque. Please try again." };
    }
  }
  return { error: "Could not issue the cheque. Please try again." };
}

const repaymentSchema = z.object({
  amount: z.coerce.number().positive("Enter a valid amount"),
  paidDate: z.string().optional(),
  note: z.string().trim().optional(),
});

export async function recordChequePayment(
  chequeId: string,
  _previous: BankingActionState,
  formData: FormData,
): Promise<BankingActionState> {
  await requireActionStaffFinanceAccess();
  const parsed = repaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the payment details" };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const cheque = await tx.issuedCheque.findUnique({
            where: { id: chequeId },
            include: { payments: { select: { amount: true } } },
          });
          if (!cheque) return { error: "Cheque not found" };
          const remaining = chequeBalance(toNum(cheque.amount), cheque.payments.map((payment) => toNum(payment.amount)));
          const paymentError = validateChequePayment(parsed.data.amount, remaining);
          if (paymentError) return { error: paymentError };
          await tx.chequePayment.create({
            data: {
              issuedChequeId: chequeId,
              amount: round2(parsed.data.amount),
              paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : new Date(),
              note: parsed.data.note || null,
            },
          });
          return { error: null };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );
      if (result.error) return { error: result.error };
      revalidatePath(`/banking/cheques/${chequeId}`);
      revalidatePath("/banking");
      return { ok: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      console.error("recordChequePayment failed", error);
      return { error: "Could not record the payment. Please try again." };
    }
  }
  return { error: "Could not record the payment. Please try again." };
}
