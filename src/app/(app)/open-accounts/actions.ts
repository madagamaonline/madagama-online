"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionStaffFinanceAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeOpenAccountState, openAccountInvoiceStatus } from "@/lib/open-account";
import { round2, toNum } from "@/lib/utils";
import { formatLKR } from "@/lib/utils";
import { sendSms } from "@/lib/sms";

const schema = z.object({
  accountId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount greater than zero."),
  paidDate: z.coerce.date(),
  method: z.enum(["CASH", "BANK", "CHEQUE", "CARD"]),
  note: z.string().trim().max(500).optional(),
});

export type OpenAccountPaymentState = { ok?: boolean; error?: string };

export async function recordOpenAccountPayment(
  _previous: OpenAccountPaymentState,
  formData: FormData,
): Promise<OpenAccountPaymentState> {
  let user;
  try { user = await requireActionStaffFinanceAccess(); } catch { return { error: "You don't have permission to record this payment." }; }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  const data = parsed.data;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const invoiceId = await prisma.$transaction(async (tx) => {
        const account = await tx.openAccount.findUnique({
          where: { id: data.accountId },
          include: { payments: true, invoice: { select: { id: true, voidedAt: true } } },
        });
        if (!account || account.invoice.voidedAt || account.status === "VOIDED") throw new Error("This account is not active.");
        const before = computeOpenAccountState(toNum(account.principal), account.payments.map((p) => ({ amount: toNum(p.amount), method: p.method })));
        if (account.status === "SETTLED" || before.isSettled) throw new Error("This account is already settled.");
        const amount = round2(data.amount);
        if (amount > before.outstanding) throw new Error(`Payment cannot exceed the outstanding balance of LKR ${before.outstanding.toFixed(2)}.`);
        const duplicate = await tx.openAccountPayment.count({
          where: { accountId: account.id, amount, method: data.method, recordedByUserId: user.id, createdAt: { gte: new Date(Date.now() - 30_000) } },
        });
        if (duplicate) throw new Error("A matching payment was just recorded. Wait a moment before trying again.");
        await tx.openAccountPayment.create({ data: { accountId: account.id, amount, paidDate: data.paidDate, method: data.method, note: data.note || null, recordedByUserId: user.id } });
        const authoritative = await tx.openAccountPayment.aggregate({ where: { accountId: account.id }, _sum: { amount: true } });
        const credited = round2(toNum(authoritative._sum.amount));
        const settled = credited >= toNum(account.principal);
        await tx.invoice.update({ where: { id: account.invoiceId }, data: { amountPaid: credited, status: openAccountInvoiceStatus(toNum(account.principal), credited) } });
        await tx.openAccount.update({ where: { id: account.id }, data: { status: settled ? "SETTLED" : "ACTIVE" } });
        return account.invoiceId;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      for (const path of ["/open-accounts", `/open-accounts/${data.accountId}`, `/invoices/${invoiceId}`, "/invoices", "/customers", "/dashboard", "/reports", "/reminders", "/shift-report"]) revalidatePath(path);
      return { ok: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      return { error: error instanceof Error ? error.message : "Could not record the payment." };
    }
  }
  return { error: "The account changed at the same time. Please try again." };
}

export async function sendOpenAccountReminder(accountId: string): Promise<{ ok: boolean; message: string }> {
  try { await requireActionStaffFinanceAccess(); } catch { return { ok: false, message: "You don't have permission to send reminders." }; }
  const account = await prisma.openAccount.findUnique({ where: { id: accountId }, include: { customer: true, invoice: { select: { invoiceNumber: true, voidedAt: true } }, payments: true } });
  if (!account || account.status === "VOIDED" || account.invoice.voidedAt) return { ok: false, message: "Account not found or voided." };
  const state = computeOpenAccountState(toNum(account.principal), account.payments.map((p) => ({ amount: toNum(p.amount), method: p.method })), account.dueDate);
  if (state.isSettled) return { ok: false, message: "This account is already paid." };
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  const business = setting?.businessName ?? "Madagama";
  const due = account.dueDate ? ` The promised payment date is ${account.dueDate.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}.` : "";
  const message = `${business}: Dear ${account.customer.name}, your Pay Later balance on ${account.invoice.invoiceNumber} is ${formatLKR(state.outstanding)}.${due} Please make a payment. No interest is charged. Thank you.`;
  const result = await sendSms(account.customer.phone, message, setting?.smsSenderId, setting?.textlkApiToken);
  try { await prisma.notificationLog.create({ data: { type: "CUSTOMER_PAYMENT", refId: account.id, dedupeKey: null, channel: "SMS", recipient: account.customer.phone, message, status: result.ok ? "SENT" : "FAILED", error: result.error ?? null } }); } catch {}
  return result.ok ? { ok: true, message: result.simulated ? "Reminder logged (SMS not configured yet)." : "Reminder SMS sent." } : { ok: false, message: result.error ?? "Failed to send SMS." };
}
