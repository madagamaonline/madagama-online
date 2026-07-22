import "server-only";
import { differenceInDays, format } from "date-fns";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { computeCreditState } from "./credit";
import { sendSms, type SmsResult } from "./sms";
import { toNum, formatLKR } from "./utils";
import { ACTIVE_REQUEST_STATUSES, requestNumber } from "./customer-requests";
import { businessDayKey } from "./dates";
import { computeOpenAccountState } from "./open-account";

/** Run `tasks` with at most `size` in flight at once (keeps the cron under the
 *  serverless time limit without a p-limit dependency). */
async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run));
  }
}

async function log(
  type: NotificationType,
  refId: string,
  dedupeKey: string | null,
  recipient: string,
  message: string,
  result: SmsResult,
) {
  const status = result.ok ? "SENT" : "FAILED";
  const error = result.error ?? null;
  try {
    // Upsert on dedupeKey so retrying a previously FAILED send updates that row
    // (FAILED -> SENT) instead of colliding on the unique constraint. With a
    // plain create the conflict was swallowed below, leaving the row FAILED and
    // re-sending on every run once we stop deduping on failed sends.
    if (dedupeKey) {
      await prisma.notificationLog.upsert({
        where: { dedupeKey },
        create: { type, refId, dedupeKey, channel: "SMS", recipient, message, status, error },
        update: { status, error, recipient, message, sentAt: new Date() },
      });
    } else {
      await prisma.notificationLog.create({
        data: { type, refId, dedupeKey, channel: "SMS", recipient, message, status, error },
      });
    }
  } catch {
    // best-effort logging — never let a logging failure abort the cron run
  }
}

export type ReminderSummary = {
  sent: number;
  skipped: number;
  failed: number;
  customers: number;
  suppliers: number;
  requests: number;
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

  type SendTask = {
    type: NotificationType;
    refId: string;
    dedupeKey: string;
    recipient: string;
    message: string;
  };

  // Preload every used dedupe key in ONE query, instead of querying per reminder
  // inside the loop (the old O(N) round-trips). Membership is then an in-memory
  // Set lookup, so building the work list does no further DB I/O.
  //
  // Only SENT keys suppress a resend: if a previous send FAILED (e.g. a text.lk
  // outage), we want the next cron run to retry it, not skip it forever. This is
  // the lightweight outage tolerance — retry on the next daily run.
  const seenKeys = new Set(
    (
      await prisma.notificationLog.findMany({
        where: { dedupeKey: { not: null }, status: "SENT" },
        select: { dedupeKey: true },
      })
    ).map((r) => r.dedupeKey as string),
  );

  const tasks: SendTask[] = [];
  const queue = (t: SendTask) => {
    if (seenKeys.has(t.dedupeKey)) {
      skipped++;
      return;
    }
    seenKeys.add(t.dedupeKey); // guard against duplicate keys within this run
    tasks.push(t);
  };

  // --- Internal customer-request follow-ups ---
  // These go to the configured shop/admin phone, not to the customer. A request
  // remains visible in-app regardless of whether SMS is enabled or configured.
  const customerRequests = adminPhone
    ? await prisma.customerRequest.findMany({
        where: {
          status: { in: ACTIVE_REQUEST_STATUSES },
          remindBySms: true,
          followUpAt: { lte: now },
        },
        include: {
          customer: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
      })
    : [];
  for (const request of customerRequests) {
    const customer = request.customer?.name ?? request.contactName ?? request.contactPhone ?? "walk-in customer";
    queue({
      type: "CUSTOMER_REQUEST",
      refId: request.id,
      dedupeKey: `customer-request:${request.id}:${businessDayKey(request.followUpAt!)}`,
      recipient: adminPhone!,
      message: `${business} reminder: ${requestNumber(request.requestNumber)} ${request.title} for ${customer}. Assigned to ${request.assignedTo.name}.`,
    });
  }

  // --- Customer credit reminders ---
  const agreements = await prisma.creditAgreement.findMany({
    where: { status: "ACTIVE", invoice: { voidedAt: null } },
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
      a.payments.map((p) => ({ amount: toNum(p.amount), discount: toNum(p.discount), paidDate: p.paidDate })),
      now,
    );
    if (state.isSettled) continue;
    const phone = a.customer.phone;

    // Interest warning within 7 days before grace ends.
    const daysToGraceEnd = differenceInDays(state.graceEndDate, now);
    if (daysToGraceEnd >= 0 && daysToGraceEnd <= 7) {
      queue({
        type: "INTEREST_WARNING",
        refId: a.id,
        dedupeKey: `interest-warning:${a.id}`,
        recipient: phone,
        message: `${business}: Dear ${a.customer.name}, balance ${formatLKR(state.outstanding)} on ${a.invoice.invoiceNumber} is interest-free until ${format(state.graceEndDate, "dd MMM yyyy")}. Please settle to avoid interest.`,
      });
    }

    // Overdue: one reminder per calendar month.
    if (state.isOverdue && state.outstanding > 0) {
      queue({
        type: "CUSTOMER_PAYMENT",
        refId: a.id,
        dedupeKey: `overdue:${a.id}:${format(now, "yyyy-MM")}`,
        recipient: phone,
        message: `${business}: Dear ${a.customer.name}, your balance on ${a.invoice.invoiceNumber} is ${formatLKR(state.outstanding)} (incl. interest). Please make a payment.`,
      });
    }
  }

  // --- Pay Later reminders (dated accounts only; undated accounts stay manual) ---
  const openAccounts = await prisma.openAccount.findMany({
    where: { status: "ACTIVE", dueDate: { not: null }, invoice: { voidedAt: null } },
    include: { customer: { select: { name: true, phone: true } }, invoice: { select: { invoiceNumber: true } }, payments: true },
  });
  for (const account of openAccounts) {
    const state = computeOpenAccountState(toNum(account.principal), account.payments.map((p) => ({ amount: toNum(p.amount), method: p.method })), account.dueDate, now);
    if (state.isSettled) continue;
    const days = differenceInDays(account.dueDate!, now);
    if (days >= 0 && days <= 7) queue({ type: "CUSTOMER_PAYMENT", refId: account.id, dedupeKey: `pay-later-due:${account.id}`, recipient: account.customer.phone, message: `${business}: Dear ${account.customer.name}, your Pay Later balance on ${account.invoice.invoiceNumber} is ${formatLKR(state.outstanding)}, promised by ${format(account.dueDate!, "dd MMM yyyy")}. No interest is charged. Thank you.` });
    if (days < 0) queue({ type: "CUSTOMER_PAYMENT", refId: account.id, dedupeKey: `pay-later-overdue:${account.id}:${format(now, "yyyy-MM")}`, recipient: account.customer.phone, message: `${business}: Dear ${account.customer.name}, your Pay Later balance on ${account.invoice.invoiceNumber} is ${formatLKR(state.outstanding)} and the promised date has passed. Please make a payment. No interest is charged. Thank you.` });
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
      const when = days < 0 ? "OVERDUE" : `due in ${days} day(s)`;
      queue({
        type: "SUPPLIER_CREDIT",
        refId: p.id,
        dedupeKey: days < 0 ? `supplier-overdue:${p.id}:${format(now, "yyyy-MM")}` : `supplier-due:${p.id}`,
        recipient: adminPhone,
        message: `${business} admin: Payment to ${p.supplier.name} of ${formatLKR(balance)} is ${when} (due ${format(due, "dd MMM")}).`,
      });
    }
  }

  // Deliver concurrently in small batches so 50+ reminders don't run for 15–25s
  // of sequential awaits and blow the serverless time limit. Each send still logs
  // its own dedupe row (success or failure) right after the attempt.
  await inBatches(tasks, 8, async (t) => {
    const r = await sendSms(t.recipient, t.message, senderId, apiToken);
    await log(t.type, t.refId, t.dedupeKey, t.recipient, t.message, r);
    if (r.ok) sent++;
    else failed++;
  });

  return {
    sent,
    skipped,
    failed,
    customers: agreements.length + openAccounts.length,
    suppliers: adminPhone ? 1 : 0,
    requests: customerRequests.length,
  };
}
