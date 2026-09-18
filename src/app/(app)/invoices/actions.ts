"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma, type TaxCategory, type UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAdmin, requireActionUser } from "@/lib/auth";
import { canCreatePayLaterSale } from "@/lib/authorization";
import { assertUniqueProductLines } from "@/lib/financial-guards";
import { decrementStockForSale, StockConflictError } from "@/lib/stock-decrement";
import { logStockMovement } from "@/lib/stock";
import { sumLines } from "@/lib/totals";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { round2, toNum } from "@/lib/utils";
import { allocateOpenAccountPayment, OPEN_ACCOUNT_USER_PAYMENT_METHODS, openAccountInvoiceStatus, type OpenAccountPaymentMethod } from "@/lib/open-account";
import { applyInvoiceVoid, VoidInvoiceError, voidInvoiceSchema } from "@/lib/invoice-void";
import { isValidUnitDiscount } from "@/lib/sale-discounts";
import { isValidWarrantyMonths } from "@/lib/warranty";
import { canonicalUnit, isUnitAllowed, toCanonicalQuantity } from "@/lib/units";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  enteredQty: z.coerce.number().positive().optional(),
  enteredUnit: z.enum(["EACH", "METER", "CENTIMETER", "MILLIMETER", "FOOT", "INCH"]).optional(),
  unitPrice: z.coerce.number().min(0),
  unitDiscount: z.coerce.number().min(0).default(0),
  warrantyMonths: z.number().int().nullable().optional().refine(
    (value) => value === undefined || isValidWarrantyMonths(value),
    { message: "Select a valid warranty period." },
  ),
}).refine((line) => isValidUnitDiscount(line.unitPrice, line.unitDiscount), {
  message: "A product discount cannot exceed its unit price.",
  path: ["unitDiscount"],
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1, "Add at least one item"),
  discount: z.coerce.number().min(0).default(0),
  customerId: z.string().optional().nullable(),
  soldByEmployeeId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const openAccountSaleSchema = inputSchema.extend({
  dueDate: z.string().trim().optional().nullable(),
  initialPayment: z.coerce.number().min(0, "Advance payment cannot be negative.").default(0),
  initialPaymentMethod: z.enum(OPEN_ACCOUNT_USER_PAYMENT_METHODS).default("CASH"),
});

export type CreateInvoiceInput = z.input<typeof inputSchema>;
export type CreatedInvoice = {
  id: string;
  invoiceNumber: string;
  taxCategory: TaxCategory;
  grandTotal: number;
};
export type CreateInvoiceResult =
  | { ok: true; saleGroupId: string; invoices: CreatedInvoice[] }
  | { ok: false; error: string };

type Computed = {
  productId: string;
  code: string;
  name: string;
  qty: number;
  unit: UnitOfMeasure;
  enteredQty: number;
  enteredUnit: UnitOfMeasure;
  unitPrice: number;
  unitDiscount: number;
  warrantyMonths: number | null;
  costSnapshot: number;
  supplierAtSaleId: string | null;
  supplierNameSnapshot: string | null;
};

export async function createCashInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  return createSale(input, "CASH");
}

export async function createOpenAccountSale(
  input: CreateInvoiceInput & {
    dueDate?: string | null;
    initialPayment?: number;
    initialPaymentMethod?: Exclude<OpenAccountPaymentMethod, "RETURN">;
  },
): Promise<CreateInvoiceResult> {
  const parsed = openAccountSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid Pay Later sale." };
  if (!parsed.data.customerId) return { ok: false, error: "Select a customer for Pay Later." };
  const dueDate = parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T00:00:00+05:30`) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) return { ok: false, error: "Enter a valid promised date." };
  return createSale(parsed.data, "OPEN_ACCOUNT", {
    dueDate,
    initialPayment: round2(parsed.data.initialPayment),
    initialPaymentMethod: parsed.data.initialPaymentMethod,
  });
}

type OpenAccountSaleOptions = {
  dueDate: Date | null;
  initialPayment: number;
  initialPaymentMethod: Exclude<OpenAccountPaymentMethod, "RETURN">;
};

async function createSale(
  input: CreateInvoiceInput,
  type: "CASH" | "OPEN_ACCOUNT",
  openAccountOptions: OpenAccountSaleOptions | null = null,
): Promise<CreateInvoiceResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid sale data" };
  }
  const data = parsed.data;
  try {
    assertUniqueProductLines(data.lines);
  } catch {
    return { ok: false, error: "Each product may appear only once in a sale." };
  }
  let session;
  try {
    session = await requireActionUser();
  } catch {
    return { ok: false, error: "Please sign in." };
  }
  if (type === "OPEN_ACCOUNT" && !canCreatePayLaterSale(session.role)) {
    return { ok: false, error: "You don't have permission to create Pay Later sales." };
  }
  if (type === "OPEN_ACCOUNT") {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId! }, select: { id: true } });
    if (!customer) return { ok: false, error: "The selected customer no longer exists." };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: data.lines.map((l) => l.productId) }, active: true },
    select: {
      id: true,
      code: true,
      name: true,
      taxable: true,
      quantityInStock: true,
      quantityReserved: true,
      costPrice: true,
      trackingType: true,
      primarySupplierId: true,
      primarySupplier: { select: { name: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Validate existence and stock.
  const shortages: string[] = [];
  for (const line of data.lines) {
    const p = byId.get(line.productId);
    if (!p) return { ok: false, error: "One of the items no longer exists." };
    const enteredQty = line.enteredQty ?? line.qty;
    const enteredUnit = line.enteredUnit ?? canonicalUnit(p.trackingType);
    if (!isUnitAllowed(p.trackingType, enteredUnit)) return { ok: false, error: `Invalid unit for ${p.code}.` };
    if (p.trackingType === "PIECE" && !Number.isInteger(enteredQty)) return { ok: false, error: `${p.code} must be sold in whole pieces.` };
    const qty = toCanonicalQuantity(enteredQty, enteredUnit, p.trackingType);
    const available = toNum(p.quantityInStock) - toNum(p.quantityReserved);
    if (qty > available) {
      shortages.push(`${p.code} (available ${available}, ${toNum(p.quantityReserved)} reserved, need ${qty})`);
    }
  }
  if (shortages.length) return { ok: false, error: `Not enough stock: ${shortages.join(", ")}` };

  // Split the cart into the Taxable and Non-taxable "books".
  const taxable: Computed[] = [];
  const nonTaxable: Computed[] = [];
  for (const line of data.lines) {
    const p = byId.get(line.productId)!;
    const enteredQty = line.enteredQty ?? line.qty;
    const enteredUnit = line.enteredUnit ?? canonicalUnit(p.trackingType);
    const qty = toCanonicalQuantity(enteredQty, enteredUnit, p.trackingType);
    const entry: Computed = {
      productId: p.id,
      code: p.code,
      name: p.name,
      qty,
      unit: canonicalUnit(p.trackingType),
      enteredQty,
      enteredUnit,
      unitPrice: line.unitPrice,
      unitDiscount: line.unitDiscount,
      warrantyMonths: line.warrantyMonths ?? null,
      costSnapshot: toNum(p.costPrice),
      supplierAtSaleId: p.primarySupplierId,
      supplierNameSnapshot: p.primarySupplier?.name ?? null,
    };
    (p.taxable ? taxable : nonTaxable).push(entry);
  }

  const netTaxable = round2(
    taxable.reduce((s, l) => s + l.qty * (l.unitPrice - l.unitDiscount), 0),
  );
  const netNon = round2(
    nonTaxable.reduce((s, l) => s + l.qty * (l.unitPrice - l.unitDiscount), 0),
  );
  const netTotalAll = round2(netTaxable + netNon);

  // Product discounts stay on their own lines/category. Allocate only the
  // bill-level discount across books, proportional to each category's net value.
  let discTaxable = 0;
  let discNon = 0;
  if (data.discount > 0 && netTotalAll > 0) {
    const billDiscount = Math.min(data.discount, netTotalAll);
    if (taxable.length && nonTaxable.length) {
      discTaxable = round2((billDiscount * netTaxable) / netTotalAll);
      discNon = round2(billDiscount - discTaxable);
    } else if (taxable.length) {
      discTaxable = round2(Math.min(billDiscount, netTaxable));
    } else {
      discNon = round2(Math.min(billDiscount, netNon));
    }
  }

  const groups: { category: TaxCategory; items: Computed[]; discount: number }[] = [];
  if (taxable.length) groups.push({ category: "TAXABLE", items: taxable, discount: discTaxable });
  if (nonTaxable.length) groups.push({ category: "NON_TAXABLE", items: nonTaxable, discount: discNon });

  const groupTotals = groups.map((group) => sumLines(group.items, group.discount));
  const saleTotal = round2(groupTotals.reduce((sum, totals) => sum + totals.grandTotal, 0));
  const initialPayment = type === "OPEN_ACCOUNT" ? (openAccountOptions?.initialPayment ?? 0) : 0;
  if (initialPayment > saleTotal) {
    return { ok: false, error: `Advance payment cannot exceed the sale total of LKR ${saleTotal.toFixed(2)}.` };
  }
  const paymentAllocations = allocateOpenAccountPayment(
    initialPayment,
    groupTotals.map((totals) => totals.grandTotal),
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const saleGroup = await tx.saleGroup.create({ data: {} });
          const out: CreatedInvoice[] = [];
          for (const [groupIndex, g] of groups.entries()) {
            const totals = groupTotals[groupIndex]!;
            const paidNow = paymentAllocations[groupIndex] ?? 0;
            const invoiceNumber = await generateInvoiceNumber(tx, g.category);
            const inv = await tx.invoice.create({
              data: {
                invoiceNumber,
                type,
                taxCategory: g.category,
                status: type === "CASH" ? "PAID" : openAccountInvoiceStatus(totals.grandTotal, paidNow),
                customerId: data.customerId || null,
                soldByEmployeeId: data.soldByEmployeeId || null,
                createdByUserId: session?.id ?? null,
                saleGroupId: saleGroup.id,
                notes: data.notes?.trim() || null,
                subtotal: totals.subtotal,
                discount: totals.discount,
                grandTotal: totals.grandTotal,
                amountPaid: type === "CASH" ? totals.grandTotal : paidNow,
                items: {
                  create: g.items.map((it) => ({
                    productId: it.productId,
                    nameSnapshot: it.name,
                    codeSnapshot: it.code,
                    qty: it.qty,
                    unit: it.unit,
                    enteredQty: it.enteredQty,
                    enteredUnit: it.enteredUnit,
                    unitPrice: it.unitPrice,
                    unitDiscount: it.unitDiscount,
                    warrantyMonths: it.warrantyMonths,
                    lineTotal: round2(it.qty * (it.unitPrice - it.unitDiscount)),
                    costSnapshot: it.costSnapshot,
                    supplierAtSaleId: it.supplierAtSaleId,
                    supplierNameSnapshot: it.supplierNameSnapshot,
                    supplierAttribution: "CAPTURED",
                  })),
                },
              },
            });
            if (type === "OPEN_ACCOUNT") {
              await tx.openAccount.create({
                data: {
                  invoiceId: inv.id,
                  customerId: data.customerId!,
                  principal: totals.grandTotal,
                  dueDate: openAccountOptions?.dueDate ?? null,
                  status: paidNow >= totals.grandTotal ? "SETTLED" : "ACTIVE",
                  payments: paidNow > 0 ? {
                    create: {
                      amount: paidNow,
                      paidDate: new Date(),
                      method: openAccountOptions!.initialPaymentMethod,
                      note: "Advance received at sale",
                      recordedByUserId: session.id,
                    },
                  } : undefined,
                },
              });
            }
            for (const it of [...g.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
              const balanceAfter = await decrementStockForSale(tx, {
                productId: it.productId,
                productCode: it.code,
                qty: it.qty,
              });
              await logStockMovement(tx, {
                productId: it.productId,
                type: "SALE",
                qty: -it.qty,
                balanceAfter,
                refId: inv.id,
                userId: session?.id ?? null,
                unit: it.unit,
              });
            }
            out.push({ id: inv.id, invoiceNumber, taxCategory: g.category, grandTotal: totals.grandTotal });
          }
          return { saleGroupId: saleGroup.id, invoices: out };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      );

      revalidatePath("/invoices");
      revalidatePath("/products");
      revalidatePath("/dashboard");
      revalidatePath("/open-accounts");
      revalidatePath("/reports");
      revalidatePath("/shift-report");
      revalidatePath("/reminders");
      revalidatePath("/customers");
      if (data.customerId) revalidatePath(`/customers/${data.customerId}`);
      return { ok: true, ...created };
    } catch (e) {
      if (e instanceof StockConflictError) {
        return { ok: false, error: `Not enough stock for ${e.productCode}. Please refresh the cart.` };
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2002" || e.code === "P2034") &&
        attempt < 2
      ) {
        continue; // retry invoice number
      }
      console.error("createSale failed", e);
      return { ok: false, error: "Could not save the sale. Please try again." };
    }
  }
  return { ok: false, error: "Could not generate an invoice number. Please try again." };
}

export type VoidInvoiceResult = { ok: true } | { ok: false; error: string };

/** Reverse an accidental sale without deleting its accounting history. */
export async function voidInvoice(input: {
  invoiceId: string;
  reason: string;
}): Promise<VoidInvoiceResult> {
  const parsed = voidInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid void request." };
  }

  let admin;
  try {
    admin = await requireActionAdmin();
  } catch {
    return { ok: false, error: "Only an administrator can void an invoice." };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          await applyInvoiceVoid(tx, {
            invoiceId: parsed.data.invoiceId,
            reason: parsed.data.reason,
            adminId: admin.id,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      );

      for (const path of [
        `/invoices/${parsed.data.invoiceId}`,
        "/invoices",
        "/products",
        "/dashboard",
        "/reports",
        "/credit",
        "/open-accounts",
        "/customers",
        "/reminders",
        "/shift-report",
      ]) {
        revalidatePath(path);
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof VoidInvoiceError) return { ok: false, error: error.message };
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      console.error("voidInvoice failed", error);
      return { ok: false, error: "Could not void the invoice. Please try again." };
    }
  }
  return { ok: false, error: "The invoice changed at the same time. Please try again." };
}
