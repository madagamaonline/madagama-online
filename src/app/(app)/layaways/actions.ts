"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { canHandover, layawayTotals, statusAfterCollection, validateLayawayPayment } from "@/lib/layaway";
import { logStockMovement } from "@/lib/stock";
import { round2, toNum } from "@/lib/utils";

const createSchema = z.object({
  customerId: z.string().min(1, "Select a customer."),
  lines: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().positive(), unitPrice: z.number().min(0) })).min(1, "Add at least one product."),
  discount: z.number().min(0).default(0),
  initialPayment: z.number().min(0).default(0),
  paymentMethod: z.enum(["CASH", "BANK", "CHEQUE", "CARD"]).default("CASH"),
  paymentReference: z.string().max(120).optional(),
  promisedPickupDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateLayawayInput = z.input<typeof createSchema>;
export type LayawayActionState = { ok?: boolean; error?: string; id?: string; paymentId?: string };

const retryable = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");
const refresh = (id: string, customerId?: string) => {
  for (const path of ["/layaways", `/layaways/${id}`, "/products", "/dashboard", "/reports", "/shift-report"]) revalidatePath(path);
  if (customerId) revalidatePath(`/customers/${customerId}`);
};

export async function createLayaway(input: CreateLayawayInput): Promise<LayawayActionState> {
  let user;
  try { user = await requireActionUser(); } catch { return { error: "Please sign in again." }; }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid layaway." };
  const data = parsed.data;
  if (new Set(data.lines.map((line) => line.productId)).size !== data.lines.length) return { error: "Each product may appear only once." };
  const totals = layawayTotals(data.lines, data.discount);
  if (totals.total <= 0) return { error: "Layaway total must be greater than zero." };
  if (data.initialPayment > totals.total) return { error: "Initial installment cannot exceed the total." };
  const promised = data.promisedPickupDate ? new Date(`${data.promisedPickupDate}T00:00:00+05:30`) : null;
  if (promised && Number.isNaN(promised.getTime())) return { error: "Enter a valid pickup date." };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const products = await tx.product.findMany({ where: { id: { in: data.lines.map((line) => line.productId) }, active: true }, select: { id: true, code: true, name: true, costPrice: true, quantityInStock: true, quantityReserved: true, taxable: true } });
        if (products.length !== data.lines.length) throw new Error("One of the products is no longer available.");
        if (new Set(products.map((product) => product.taxable)).size > 1) throw new Error("Create separate layaways for taxable and non-taxable products.");
        const byId = new Map(products.map((product) => [product.id, product]));
        const order = await tx.layawayOrder.create({
          data: { customerId: data.customerId, subtotal: totals.subtotal, discount: totals.discount, total: totals.total, collectedAmount: data.initialPayment, status: statusAfterCollection(totals.total, data.initialPayment), promisedPickupDate: promised, notes: data.notes?.trim() || null, createdByUserId: user.id,
            items: { create: data.lines.map((line) => { const product = byId.get(line.productId)!; return { productId: product.id, nameSnapshot: product.name, codeSnapshot: product.code, unitPrice: line.unitPrice, costSnapshot: product.costPrice, qty: line.qty, lineTotal: round2(line.qty * line.unitPrice) }; }) } },
        });
        for (const line of [...data.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const product = byId.get(line.productId)!;
          if (product.quantityInStock - product.quantityReserved < line.qty) throw new Error(`Not enough available stock for ${product.code}.`);
          const updated = await tx.product.updateMany({ where: { id: product.id, quantityReserved: product.quantityReserved, quantityInStock: { gte: product.quantityReserved + line.qty } }, data: { quantityReserved: { increment: line.qty } } });
          if (updated.count !== 1) throw new Prisma.PrismaClientKnownRequestError("Reservation conflict", { code: "P2034", clientVersion: "layaway" });
          await logStockMovement(tx, { productId: product.id, type: "RESERVATION", qty: 0, balanceAfter: product.quantityInStock, reason: `Reserved ${line.qty} for layaway LAY-${String(order.orderNumber).padStart(6, "0")}`, refId: order.id, userId: user.id });
        }
        const payment = data.initialPayment > 0 ? await tx.layawayPayment.create({ data: { orderId: order.id, amount: data.initialPayment, method: data.paymentMethod, reference: data.paymentReference?.trim() || null, paidDate: new Date(), recordedByUserId: user.id } }) : null;
        return { id: order.id, paymentId: payment?.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      refresh(result.id, data.customerId);
      return { ok: true, ...result };
    } catch (error) {
      if (retryable(error) && attempt < 2) continue;
      return { error: error instanceof Error ? error.message : "Could not create the layaway." };
    }
  }
  return { error: "Stock changed at the same time. Please try again." };
}

const paymentSchema = z.object({ orderId: z.string().min(1), amount: z.coerce.number().positive("Enter an amount greater than zero."), method: z.enum(["CASH", "BANK", "CHEQUE", "CARD"]), paidDate: z.coerce.date(), reference: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional() });
export async function recordLayawayPayment(_previous: LayawayActionState, formData: FormData): Promise<LayawayActionState> {
  let user;
  try { user = await requireActionUser(); } catch { return { error: "Please sign in again." }; }
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  const data = parsed.data;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.layawayOrder.findUnique({ where: { id: data.orderId }, include: { payments: { select: { amount: true } } } });
        if (!order || order.status !== "ACTIVE") throw new Error(order?.status === "PAID_AWAITING_PICKUP" ? "This layaway is already fully paid." : "This layaway is not accepting payments.");
        const collected = round2(order.payments.reduce((sum, payment) => sum + toNum(payment.amount), 0));
        const outstanding = round2(toNum(order.total) - collected);
        const validation = validateLayawayPayment(data.amount, outstanding);
        if (validation) throw new Error(validation);
        const duplicate = await tx.layawayPayment.count({ where: { orderId: order.id, amount: round2(data.amount), method: data.method, recordedByUserId: user.id, createdAt: { gte: new Date(Date.now() - 30_000) } } });
        if (duplicate) throw new Error("A matching payment was just recorded. Wait a moment before trying again.");
        const payment = await tx.layawayPayment.create({ data: { orderId: order.id, amount: round2(data.amount), method: data.method, paidDate: data.paidDate, reference: data.reference || null, note: data.note || null, recordedByUserId: user.id } });
        const sum = await tx.layawayPayment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
        const authoritative = round2(toNum(sum._sum.amount));
        if (authoritative > toNum(order.total)) throw new Error("Payment would exceed the outstanding balance.");
        await tx.layawayOrder.update({ where: { id: order.id }, data: { collectedAmount: authoritative, status: statusAfterCollection(toNum(order.total), authoritative) } });
        return { paymentId: payment.id, customerId: order.customerId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      refresh(data.orderId, result.customerId);
      return { ok: true, id: data.orderId, paymentId: result.paymentId };
    } catch (error) {
      if (retryable(error) && attempt < 2) continue;
      return { error: error instanceof Error ? error.message : "Could not record the payment." };
    }
  }
  return { error: "The balance changed at the same time. Please try again." };
}

export async function cancelLayaway(_previous: LayawayActionState, formData: FormData): Promise<LayawayActionState> {
  let user;
  try { user = await requireActionUser(); } catch { return { error: "Please sign in again." }; }
  const parsed = z.object({ orderId: z.string().min(1), reason: z.string().trim().min(5, "Give a cancellation reason.").max(500) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.layawayOrder.findUnique({ where: { id: parsed.data.orderId }, include: { items: true } });
      if (!order || (order.status !== "ACTIVE" && order.status !== "PAID_AWAITING_PICKUP")) throw new Error("This layaway cannot be cancelled.");
      for (const item of order.items) {
        const updated = await tx.product.updateMany({ where: { id: item.productId, quantityReserved: { gte: item.qty } }, data: { quantityReserved: { decrement: item.qty } } });
        if (updated.count !== 1) throw new Error(`Reserved stock is inconsistent for ${item.codeSnapshot}.`);
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { quantityInStock: true } });
        await logStockMovement(tx, { productId: item.productId, type: "RESERVATION_RELEASE", qty: 0, balanceAfter: product.quantityInStock, reason: `Released ${item.qty}; layaway cancelled: ${parsed.data.reason}`, refId: order.id, userId: user.id });
      }
      await tx.layawayOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: user.id, cancelReason: parsed.data.reason } });
      return { customerId: order.customerId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    refresh(parsed.data.orderId, result.customerId);
    return { ok: true, id: parsed.data.orderId };
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not cancel the layaway." }; }
}

export async function handoverLayaway(_previous: LayawayActionState, formData: FormData): Promise<LayawayActionState> {
  let user;
  try { user = await requireActionUser(); } catch { return { error: "Please sign in again." }; }
  const orderId = String(formData.get("orderId") ?? "");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.layawayOrder.findUnique({ where: { id: orderId }, include: { items: { include: { product: { select: { taxable: true, quantityInStock: true, quantityReserved: true } } } }, payments: { select: { amount: true } } } });
        if (!order) throw new Error("Layaway not found.");
        if (order.status === "RELEASED" && order.invoiceId) return { invoiceId: order.invoiceId, customerId: order.customerId };
        const collected = round2(order.payments.reduce((sum, payment) => sum + toNum(payment.amount), 0));
        if (!canHandover(order.status, toNum(order.total), collected)) throw new Error("Handover is allowed only after full payment.");
        const taxable = order.items[0]?.product.taxable ?? true;
        if (order.items.some((item) => item.product.taxable !== taxable)) throw new Error("Mixed tax categories cannot be handed over on one invoice.");
        const invoiceNumber = await generateInvoiceNumber(tx, taxable ? "TAXABLE" : "NON_TAXABLE");
        const invoice = await tx.invoice.create({ data: { invoiceNumber, type: "LAYAWAY", taxCategory: taxable ? "TAXABLE" : "NON_TAXABLE", customerId: order.customerId, subtotal: order.subtotal, discount: order.discount, grandTotal: order.total, amountPaid: order.total, status: "PAID", notes: `Handover for layaway LAY-${String(order.orderNumber).padStart(6, "0")}`, createdByUserId: user.id,
          items: { create: order.items.map((item) => ({ productId: item.productId, nameSnapshot: item.nameSnapshot, codeSnapshot: item.codeSnapshot, qty: item.qty, unitPrice: item.unitPrice, lineTotal: item.lineTotal, costSnapshot: item.costSnapshot })) } } });
        for (const item of order.items) {
          const updated = await tx.product.updateMany({ where: { id: item.productId, quantityReserved: { gte: item.qty }, quantityInStock: { gte: item.qty } }, data: { quantityReserved: { decrement: item.qty }, quantityInStock: { decrement: item.qty } } });
          if (updated.count !== 1) throw new Error(`Stock is inconsistent for ${item.codeSnapshot}.`);
          const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { quantityInStock: true } });
          await logStockMovement(tx, { productId: item.productId, type: "LAYAWAY_HANDOVER", qty: -item.qty, balanceAfter: product.quantityInStock, reason: `Layaway handed over`, refId: order.id, userId: user.id });
        }
        await tx.layawayOrder.update({ where: { id: order.id }, data: { status: "RELEASED", releasedAt: new Date(), releasedByUserId: user.id, invoiceId: invoice.id, collectedAmount: collected } });
        return { invoiceId: invoice.id, customerId: order.customerId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      refresh(orderId, result.customerId); revalidatePath(`/invoices/${result.invoiceId}`); revalidatePath("/invoices");
      return { ok: true, id: result.invoiceId };
    } catch (error) {
      if (retryable(error) && attempt < 2) continue;
      return { error: error instanceof Error ? error.message : "Could not hand over the order." };
    }
  }
  return { error: "The order changed at the same time. Please try again." };
}
