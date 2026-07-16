"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionUser } from "@/lib/auth";
import {
  assertUniqueProductLines,
  isRecentDuplicatePayment,
  validateDownPaymentAmount,
  validatePaymentWithDiscount,
} from "@/lib/financial-guards";
import { decrementStockForSale, StockConflictError } from "@/lib/stock-decrement";
import { sumLines } from "@/lib/totals";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { computeCreditState } from "@/lib/credit";
import { sendSms } from "@/lib/sms";
import { logStockMovement } from "@/lib/stock";
import { validateLkPhone, normalizeLkPhone } from "@/lib/phone";
import { toNum, formatLKR } from "@/lib/utils";
import { nonTaxableEnabled } from "@/lib/tax-mode";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
});

const guarantorSchema = z.object({
  name: z.string().min(1, "Guarantor name is required"),
  nic: z.string().min(1, "Guarantor NIC is required"),
  phone: z.string().min(1, "Guarantor phone is required"),
  address: z.string().optional().nullable(),
  nicFrontKey: z.string().optional().nullable(),
  nicBackKey: z.string().optional().nullable(),
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1, "Add at least one item"),
  discount: z.coerce.number().min(0).default(0),
  customerId: z.string().min(1, "Select a customer"),
  guarantor: guarantorSchema,
  soldByEmployeeId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  allowDuplicatePhone: z.boolean().optional(),
  downPayment: z.coerce.number().min(0, "Enter a valid down payment").default(0),
  downPaymentMethod: z.enum(["CASH", "BANK", "CHEQUE", "CARD"]).default("CASH"),
});

export type CreateCreditSaleInput = z.input<typeof inputSchema>;
export type CreateCreditResult =
  | { ok: true; agreementId: string }
  | { ok: false; error: string; duplicate?: boolean };

export async function createCreditSale(
  input: CreateCreditSaleInput,
): Promise<CreateCreditResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;
  try {
    assertUniqueProductLines(data.lines);
  } catch {
    return { ok: false, error: "Each product may appear only once in a sale." };
  }
  const session = await requireActionUser();

  // Validate the guarantor's phone and make sure it isn't the customer's own
  // number (a common way to fake a guarantor).
  const gPhone = validateLkPhone(data.guarantor.phone);
  if (!gPhone.ok) return { ok: false, error: `Guarantor: ${gPhone.error}` };

  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { phone: true },
  });
  if (!customer) return { ok: false, error: "Selected customer not found." };
  if (!data.allowDuplicatePhone && normalizeLkPhone(customer.phone) === gPhone.normalized) {
    return {
      ok: false,
      error: "Guarantor phone cannot be the same as the customer's phone.",
      duplicate: true,
    };
  }

  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  const interestRate = toNum(setting?.interestRatePerMonth ?? 0.02);
  const freeMonths = setting?.interestFreeMonths ?? 4;

  const products = await prisma.product.findMany({
    where: { id: { in: data.lines.map((l) => l.productId) }, active: true },
    select: {
      id: true,
      code: true,
      name: true,
      taxable: true,
      quantityInStock: true,
      costPrice: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const shortages: string[] = [];
  for (const line of data.lines) {
    const p = byId.get(line.productId);
    if (!p) return { ok: false, error: "One of the items no longer exists." };
    if (line.qty > p.quantityInStock) shortages.push(`${p.code} (have ${p.quantityInStock})`);
  }
  if (shortages.length) return { ok: false, error: `Not enough stock: ${shortages.join(", ")}` };

  // A credit agreement is one invoice, so all items must be the same tax category.
  const anyTaxable = data.lines.some((l) => byId.get(l.productId)!.taxable);
  const anyNonTaxable = data.lines.some((l) => !byId.get(l.productId)!.taxable);
  // Safety net for when the non-taxable switch is off (search already hides NT).
  if (anyNonTaxable && !(await nonTaxableEnabled())) {
    return { ok: false, error: "Non-taxable products are turned off." };
  }
  if (anyTaxable && anyNonTaxable) {
    return {
      ok: false,
      error:
        "A credit sale must be all taxable or all non-taxable items — please make two separate credit sales.",
    };
  }
  const taxCategory = anyTaxable ? "TAXABLE" : "NON_TAXABLE";

  const computed = data.lines.map((line) => {
    const p = byId.get(line.productId)!;
    return { line, p, lineTotal: line.qty * line.unitPrice };
  });
  const totals = sumLines(
    computed.map((c) => ({ qty: c.line.qty, unitPrice: c.line.unitPrice })),
    data.discount,
  );
  const downPaymentError = validateDownPaymentAmount(data.downPayment, totals.grandTotal);
  if (downPaymentError) return { ok: false, error: downPaymentError };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const agreementId = await prisma.$transaction(
        async (tx) => {
          const startedAt = new Date();
          const invoiceNumber = await generateInvoiceNumber(tx, taxCategory);
          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              type: "CREDIT",
              taxCategory,
              customerId: data.customerId,
              soldByEmployeeId: data.soldByEmployeeId || null,
              createdByUserId: session?.id ?? null,
              notes: data.notes?.trim() || null,
              subtotal: totals.subtotal,
              discount: totals.discount,
              grandTotal: totals.grandTotal,
              amountPaid: data.downPayment,
              status: data.downPayment > 0 ? "PARTIAL" : "CREDIT",
              items: {
                create: computed.map(({ line, p }) => ({
                  productId: p.id,
                  nameSnapshot: p.name,
                  codeSnapshot: p.code,
                  qty: line.qty,
                  unitPrice: line.unitPrice,
                  lineTotal: line.qty * line.unitPrice,
                  costSnapshot: toNum(p.costPrice),
                })),
              },
            },
          });
          for (const { line, p } of [...computed].sort((a, b) => a.line.productId.localeCompare(b.line.productId))) {
            const balanceAfter = await decrementStockForSale(tx, {
              productId: line.productId,
              productCode: p.code,
              qty: line.qty,
            });
            await logStockMovement(tx, {
              productId: line.productId,
              type: "SALE",
              qty: -line.qty,
              balanceAfter,
              refId: invoice.id,
              userId: session?.id ?? null,
            });
          }
          const guarantor = await tx.guarantor.create({
            data: {
              name: data.guarantor.name.trim(),
              nic: data.guarantor.nic.trim(),
              phone: gPhone.normalized,
              address: data.guarantor.address?.trim() || null,
              nicFrontKey: data.guarantor.nicFrontKey || null,
              nicBackKey: data.guarantor.nicBackKey || null,
            },
          });
          const agreement = await tx.creditAgreement.create({
            data: {
              invoiceId: invoice.id,
              customerId: data.customerId,
              guarantorId: guarantor.id,
              principal: totals.grandTotal,
              startDate: startedAt,
              interestRatePerMonth: interestRate,
              interestFreeMonths: freeMonths,
              status: "ACTIVE",
            },
          });
          if (data.downPayment > 0) {
            await tx.payment.create({
              data: {
                agreementId: agreement.id,
                amount: data.downPayment,
                paidDate: startedAt,
                method: data.downPaymentMethod,
                note: "Down payment",
                recordedByUserId: session.id,
              },
            });
          }
          return agreement.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      );

      revalidatePath("/credit");
      revalidatePath("/credit-invoices");
      revalidatePath("/products");
      revalidatePath("/dashboard");
      return { ok: true, agreementId };
    } catch (e) {
      if (e instanceof StockConflictError) {
        return { ok: false, error: `Not enough stock for ${e.productCode}. Please refresh the cart.` };
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2002" || e.code === "P2034") &&
        attempt < 2
      ) continue;
      console.error("createCreditSale failed", e);
      return { ok: false, error: "Could not save the credit sale. Please try again." };
    }
  }
  return { ok: false, error: "Could not generate an invoice number. Please try again." };
}

export type PaymentFormState = { error?: string; ok?: boolean };

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Enter a valid amount"),
  discount: z.coerce.number().min(0, "Enter a valid settlement discount").default(0),
  paidDate: z.string().optional(),
  method: z.string().optional(),
  note: z.string().optional(),
});

export async function recordPayment(
  agreementId: string,
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const parsed = paymentSchema.safeParse({
    amount: formData.get("amount"),
    discount: formData.get("discount") || 0,
    paidDate: formData.get("paidDate") || undefined,
    method: formData.get("method") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment" };

  const session = await requireActionUser();

  const paidDate = parsed.data.paidDate ? new Date(parsed.data.paidDate) : new Date();

  // Record the payment and recompute the invoice/agreement state atomically.
  // A serializable transaction (with retry) prevents the lost-update race where
  // two concurrent payments — or a double-clicked Submit — each read the same
  // starting balance and one overwrites the other's `amountPaid`. All reads and
  // writes happen inside the transaction so a mid-flight connection drop can't
  // leave a payment row without its invoice/agreement update.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const agreement = await tx.creditAgreement.findUnique({
            where: { id: agreementId },
            include: { invoice: { select: { voidedAt: true } } },
          });
          if (!agreement) return { notFound: true as const };
          if (agreement.status === "VOIDED" || agreement.invoice.voidedAt) {
            return { notFound: false as const, error: "This credit agreement is voided and cannot receive payments." };
          }

          const existingPayments = await tx.payment.findMany({ where: { agreementId } });
          const agreementInput = {
            principal: toNum(agreement.principal),
            startDate: agreement.startDate,
            interestRatePerMonth: toNum(agreement.interestRatePerMonth),
            interestFreeMonths: agreement.interestFreeMonths,
          };
          const beforePayments = existingPayments.map((p) => ({
            amount: toNum(p.amount),
            discount: toNum(p.discount),
            paidDate: p.paidDate,
          }));
          const before = computeCreditState(agreementInput, beforePayments);
          const paymentError = validatePaymentWithDiscount(
            parsed.data.amount,
            parsed.data.discount,
            before.outstanding,
          );
          if (paymentError) return { notFound: false as const, error: paymentError };

          const method = parsed.data.method?.trim() || "CASH";
          const note = parsed.data.note?.trim() || null;
          if (
            isRecentDuplicatePayment(
              existingPayments.map((payment) => ({
                ...payment,
                amount: toNum(payment.amount),
                discount: toNum(payment.discount),
              })),
              {
                amount: parsed.data.amount,
                discount: parsed.data.discount,
                paidDate,
                method,
                note,
                recordedByUserId: session.id,
              },
            )
          ) {
            return {
              notFound: false as const,
              error: "This payment was already recorded. Refresh before trying again.",
            };
          }

          await tx.payment.create({
            data: {
              agreementId,
              amount: parsed.data.amount,
              discount: parsed.data.discount,
              paidDate,
              method,
              note,
              recordedByUserId: session.id,
            },
          });

          // Re-read every payment from inside the transaction (authoritative —
          // includes the row we just wrote) rather than trusting a pre-read.
          const allPayments = [
            ...beforePayments,
            { amount: parsed.data.amount, discount: parsed.data.discount, paidDate },
          ];
          const state = computeCreditState(
            agreementInput,
            allPayments,
          );

          const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
          await tx.invoice.update({
            where: { id: agreement.invoiceId },
            data: {
              amountPaid: totalPaid,
              status: state.isSettled ? "PAID" : "PARTIAL",
            },
          });
          if (state.isSettled && agreement.status !== "SETTLED") {
            await tx.creditAgreement.update({
              where: { id: agreementId },
              data: { status: "SETTLED" },
            });
          }
          return { notFound: false as const, error: null, invoiceId: agreement.invoiceId };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );

      if (result.notFound) return { error: "Agreement not found" };
      if (result.error) return { error: result.error };

      revalidatePath(`/credit/${agreementId}`);
      if ("invoiceId" in result) revalidatePath(`/invoices/${result.invoiceId}`);
      revalidatePath("/credit");
      revalidatePath("/credit-invoices");
      revalidatePath("/dashboard");
      return { ok: true };
    } catch (e) {
      // P2034: write conflict / serialization failure — retry the whole tx.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034" && attempt < 2) {
        continue;
      }
      console.error("recordPayment failed", e);
      return { error: "Could not record the payment. Please try again." };
    }
  }
  return { error: "The till is busy — please try recording the payment again." };
}

export type ReminderResult = { ok: boolean; message: string };

export async function sendReminderNow(agreementId: string): Promise<ReminderResult> {
  await requireActionUser();
  const a = await prisma.creditAgreement.findUnique({
    where: { id: agreementId },
    include: { customer: { select: { name: true, phone: true } }, payments: true, invoice: { select: { invoiceNumber: true, voidedAt: true } } },
  });
  if (!a) return { ok: false, message: "Agreement not found" };
  if (a.status === "VOIDED" || a.invoice.voidedAt) {
    return { ok: false, message: "This credit agreement is voided and cannot receive reminders." };
  }

  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  const state = computeCreditState(
    {
      principal: toNum(a.principal),
      startDate: a.startDate,
      interestRatePerMonth: toNum(a.interestRatePerMonth),
      interestFreeMonths: a.interestFreeMonths,
    },
    a.payments.map((p) => ({ amount: toNum(p.amount), discount: toNum(p.discount), paidDate: p.paidDate })),
  );

  const business = setting?.businessName ?? "Madagama";
  const msg = `${business}: Dear ${a.customer.name}, your balance on ${a.invoice.invoiceNumber} is ${formatLKR(state.outstanding)}. Please make a payment. Thank you.`;
  const r = await sendSms(a.customer.phone, msg, setting?.smsSenderId, setting?.textlkApiToken);

  try {
    await prisma.notificationLog.create({
      data: {
        type: "CUSTOMER_PAYMENT",
        refId: a.id,
        dedupeKey: null,
        channel: "SMS",
        recipient: a.customer.phone,
        message: msg,
        status: r.ok ? "SENT" : "FAILED",
        error: r.error ?? null,
      },
    });
  } catch {
    // ignore log errors
  }

  if (!r.ok) return { ok: false, message: r.error ?? "Failed to send SMS" };
  return {
    ok: true,
    message: r.simulated ? "Reminder logged (SMS not configured yet)." : "Reminder SMS sent.",
  };
}
