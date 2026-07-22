"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma, type TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAdmin, requireActionStaffFinanceAccess, requireActionUser } from "@/lib/auth";
import { assertUniqueProductLines } from "@/lib/financial-guards";
import { decrementStockForSale, StockConflictError } from "@/lib/stock-decrement";
import { logStockMovement } from "@/lib/stock";
import { sumLines } from "@/lib/totals";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { round2, toNum } from "@/lib/utils";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { applyInvoiceVoid, VoidInvoiceError, voidInvoiceSchema } from "@/lib/invoice-void";

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1, "Add at least one item"),
  discount: z.coerce.number().min(0).default(0),
  customerId: z.string().optional().nullable(),
  soldByEmployeeId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateInvoiceInput = z.input<typeof inputSchema>;
export type CreatedInvoice = {
  id: string;
  invoiceNumber: string;
  taxCategory: TaxCategory;
  grandTotal: number;
};
export type CreateInvoiceResult =
  | { ok: true; invoices: CreatedInvoice[] }
  | { ok: false; error: string };

type Computed = {
  productId: string;
  code: string;
  name: string;
  qty: number;
  unitPrice: number;
  costSnapshot: number;
};

export async function createCashInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  return createSale(input, "CASH");
}

export async function createOpenAccountSale(
  input: CreateInvoiceInput & { dueDate?: string | null },
): Promise<CreateInvoiceResult> {
  if (!input.customerId) return { ok: false, error: "Select a customer for Pay Later." };
  const dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00+05:30`) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) return { ok: false, error: "Enter a valid promised date." };
  return createSale(input, "OPEN_ACCOUNT", dueDate);
}

async function createSale(
  input: CreateInvoiceInput,
  type: "CASH" | "OPEN_ACCOUNT",
  dueDate: Date | null = null,
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
    session = type === "OPEN_ACCOUNT" ? await requireActionStaffFinanceAccess() : await requireActionUser();
  } catch {
    return { ok: false, error: type === "OPEN_ACCOUNT" ? "You don't have permission to create Pay Later sales." : "Please sign in." };
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
      costPrice: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Safety net: the product search hides non-taxable items when the switch is
  // off, so a normal cart can't contain them — but a crafted request still could.
  if (!(await nonTaxableEnabled()) && products.some((p) => !p.taxable)) {
    return { ok: false, error: "Non-taxable products are turned off." };
  }

  // Validate existence and stock.
  const shortages: string[] = [];
  for (const line of data.lines) {
    const p = byId.get(line.productId);
    if (!p) return { ok: false, error: "One of the items no longer exists." };
    if (line.qty > p.quantityInStock) {
      shortages.push(`${p.code} (have ${p.quantityInStock}, need ${line.qty})`);
    }
  }
  if (shortages.length) return { ok: false, error: `Not enough stock: ${shortages.join(", ")}` };

  // Split the cart into the Taxable and Non-taxable "books".
  const taxable: Computed[] = [];
  const nonTaxable: Computed[] = [];
  for (const line of data.lines) {
    const p = byId.get(line.productId)!;
    const entry: Computed = {
      productId: p.id,
      code: p.code,
      name: p.name,
      qty: line.qty,
      unitPrice: line.unitPrice,
      costSnapshot: toNum(p.costPrice),
    };
    (p.taxable ? taxable : nonTaxable).push(entry);
  }

  const subTaxable = round2(taxable.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const subNon = round2(nonTaxable.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const subTotalAll = round2(subTaxable + subNon);

  // Allocate the single discount across the two books, proportional to subtotal.
  let discTaxable = 0;
  let discNon = 0;
  if (data.discount > 0 && subTotalAll > 0) {
    if (taxable.length && nonTaxable.length) {
      discTaxable = round2((data.discount * subTaxable) / subTotalAll);
      discNon = round2(data.discount - discTaxable);
    } else if (taxable.length) {
      discTaxable = round2(Math.min(data.discount, subTaxable));
    } else {
      discNon = round2(Math.min(data.discount, subNon));
    }
  }

  const groups: { category: TaxCategory; items: Computed[]; discount: number }[] = [];
  if (taxable.length) groups.push({ category: "TAXABLE", items: taxable, discount: discTaxable });
  if (nonTaxable.length) groups.push({ category: "NON_TAXABLE", items: nonTaxable, discount: discNon });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const out: CreatedInvoice[] = [];
          for (const g of groups) {
            const totals = sumLines(g.items, g.discount);
            const invoiceNumber = await generateInvoiceNumber(tx, g.category);
            const inv = await tx.invoice.create({
              data: {
                invoiceNumber,
                type,
                taxCategory: g.category,
                status: type === "CASH" ? "PAID" : "CREDIT",
                customerId: data.customerId || null,
                soldByEmployeeId: data.soldByEmployeeId || null,
                createdByUserId: session?.id ?? null,
                notes: data.notes?.trim() || null,
                subtotal: totals.subtotal,
                discount: totals.discount,
                grandTotal: totals.grandTotal,
                amountPaid: type === "CASH" ? totals.grandTotal : 0,
                items: {
                  create: g.items.map((it) => ({
                    productId: it.productId,
                    nameSnapshot: it.name,
                    codeSnapshot: it.code,
                    qty: it.qty,
                    unitPrice: it.unitPrice,
                    lineTotal: round2(it.qty * it.unitPrice),
                    costSnapshot: it.costSnapshot,
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
                  dueDate,
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
              });
            }
            out.push({ id: inv.id, invoiceNumber, taxCategory: g.category, grandTotal: totals.grandTotal });
          }
          return out;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      );

      revalidatePath("/invoices");
      revalidatePath("/products");
      revalidatePath("/dashboard");
      revalidatePath("/open-accounts");
      if (data.customerId) revalidatePath(`/customers/${data.customerId}`);
      return { ok: true, invoices: created };
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
