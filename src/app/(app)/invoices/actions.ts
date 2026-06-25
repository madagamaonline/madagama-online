"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma, type TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logStockMovement } from "@/lib/stock";
import { sumLines } from "@/lib/totals";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { round2 } from "@/lib/utils";
import { nonTaxableEnabled } from "@/lib/tax-mode";

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

type Computed = { productId: string; code: string; name: string; qty: number; unitPrice: number };

export async function createCashInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid sale data" };
  }
  const data = parsed.data;
  const session = await getSession();

  const products = await prisma.product.findMany({
    where: { id: { in: data.lines.map((l) => l.productId) } },
    select: { id: true, code: true, name: true, taxable: true, quantityInStock: true },
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
    const entry: Computed = { productId: p.id, code: p.code, name: p.name, qty: line.qty, unitPrice: line.unitPrice };
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
                type: "CASH",
                taxCategory: g.category,
                status: "PAID",
                customerId: data.customerId || null,
                soldByEmployeeId: data.soldByEmployeeId || null,
                createdByUserId: session?.id ?? null,
                notes: data.notes?.trim() || null,
                subtotal: totals.subtotal,
                discount: totals.discount,
                grandTotal: totals.grandTotal,
                amountPaid: totals.grandTotal,
                items: {
                  create: g.items.map((it) => ({
                    productId: it.productId,
                    nameSnapshot: it.name,
                    codeSnapshot: it.code,
                    qty: it.qty,
                    unitPrice: it.unitPrice,
                    lineTotal: round2(it.qty * it.unitPrice),
                  })),
                },
              },
            });
            for (const it of g.items) {
              const updated = await tx.product.update({
                where: { id: it.productId },
                data: { quantityInStock: { decrement: it.qty } },
              });
              await logStockMovement(tx, {
                productId: it.productId,
                type: "SALE",
                qty: -it.qty,
                balanceAfter: updated.quantityInStock,
                refId: inv.id,
                userId: session?.id ?? null,
              });
            }
            out.push({ id: inv.id, invoiceNumber, taxCategory: g.category, grandTotal: totals.grandTotal });
          }
          return out;
        },
        { timeout: 20000 },
      );

      revalidatePath("/invoices");
      revalidatePath("/products");
      revalidatePath("/dashboard");
      return { ok: true, invoices: created };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) {
        continue; // retry invoice number
      }
      console.error("createCashInvoice failed", e);
      return { ok: false, error: "Could not save the sale. Please try again." };
    }
  }
  return { ok: false, error: "Could not generate an invoice number. Please try again." };
}
