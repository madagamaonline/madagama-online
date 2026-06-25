import "server-only";
import { differenceInDays, format } from "date-fns";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { computeCreditState } from "./credit";
import { sendSms, type SmsResult } from "./sms";
import { toNum, formatLKR } from "./utils";

async function alreadySent(dedupeKey: string): Promise<boolean> {
  const existing = await prisma.notificationLog.findUnique({ where: { dedupeKey } });
  return !!existing;
}

async function log(
  type: NotificationType,
  refId: string,
  dedupeKey: string | null,
  recipient: string,
  message: string,
  result: SmsResult,
) {
  try {
    await prisma.notificationLog.create({
      data: {
        type,
        refId,
        dedupeKey,
        channel: "SMS",
        recipient,
        message,
        status: result.ok ? "SENT" : "FAILED",
        error: result.error ?? null,
      },
    });
  } catch {
    // unique dedupe race — ignore
  }
}

export type ReminderSummary = {
  sent: number;
  skipped: number;
  failed: number;
  customers: number;
  suppliers: number;
};

export async function runReminders(now: Date = new Date()): Promise<ReminderSummary> {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  const senderId = setting?.smsSenderId;
  const apiToken = setting?.textlkApiToken;
  const adminPhone = setting?.phone?.trim();
  const business = setting?.businessName ?? "Madagama";

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // --- Customer credit reminders ---
  const agreements = await prisma.creditAgreement.findMany({
    where: { status: "ACTIVE" },
    include: {
      customer: { select: { name: true, phone: true } },
      payments: true,
      invoice: { select: { invoiceNumber: true } },
    },
  });

  for (const a of agreements) {
    const state = computeCreditState(
      {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      },
      a.payments.map((p) => ({ amount: toNum(p.amount), paidDate: p.paidDate })),
      now,
    );
    if (state.isSettled) continue;
    const phone = a.customer.phone;

    // Interest warning within 7 days before grace ends.
    const daysToGraceEnd = differenceInDays(state.graceEndDate, now);
    if (daysToGraceEnd >= 0 && daysToGraceEnd <= 7) {
      const key = `interest-warning:${a.id}`;
      if (await alreadySent(key)) {
        skipped++;
      } else {
        const msg = `${business}: Dear ${a.customer.name}, balance ${formatLKR(state.outstanding)} on ${a.invoice.invoiceNumber} is interest-free until ${format(state.graceEndDate, "dd MMM yyyy")}. Please settle to avoid interest.`;
        const r = await sendSms(phone, msg, senderId, apiToken);
        await log("INTEREST_WARNING", a.id, key, phone, msg, r);
        if (r.ok) sent++;
        else failed++;
      }
    }

    // Overdue: one reminder per calendar month.
    if (state.isOverdue && state.outstanding > 0) {
      const key = `overdue:${a.id}:${format(now, "yyyy-MM")}`;
      if (await alreadySent(key)) {
        skipped++;
      } else {
        const msg = `${business}: Dear ${a.customer.name}, your balance on ${a.invoice.invoiceNumber} is ${formatLKR(state.outstanding)} (incl. interest). Please make a payment.`;
        const r = await sendSms(phone, msg, senderId, apiToken);
        await log("CUSTOMER_PAYMENT", a.id, key, phone, msg, r);
        if (r.ok) sent++;
        else failed++;
      }
    }
  }

  // --- Supplier credit alerts (to admin) ---
  if (adminPhone) {
    const purchases = await prisma.purchase.findMany({
      where: { status: { in: ["CREDIT", "PARTIAL"] }, creditDueDate: { not: null } },
      include: { supplier: { select: { name: true } } },
    });
    for (const p of purchases) {
      const due = p.creditDueDate!;
      const balance = toNum(p.total) - toNum(p.amountPaid);
      if (balance <= 0) continue;
      const days = differenceInDays(due, now);
      if (days > 7) continue;
      const key = days < 0 ? `supplier-overdue:${p.id}:${format(now, "yyyy-MM")}` : `supplier-due:${p.id}`;
      if (await alreadySent(key)) {
        skipped++;
        continue;
      }
      const when = days < 0 ? "OVERDUE" : `due in ${days} day(s)`;
      const msg = `${business} admin: Payment to ${p.supplier.name} of ${formatLKR(balance)} is ${when} (due ${format(due, "dd MMM")}).`;
      const r = await sendSms(adminPhone, msg, senderId, apiToken);
      await log("SUPPLIER_CREDIT", p.id, key, adminPhone, msg, r);
      if (r.ok) sent++;
      else failed++;
    }
  }

  return { sent, skipped, failed, customers: agreements.length, suppliers: adminPhone ? 1 : 0 };
}
