"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type QuotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { sumLines } from "@/lib/totals";
import { round2 } from "@/lib/utils";
import { generateQuotationNumber } from "@/lib/quotation-number";

const lineSchema = z.object({
  productId: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Each line needs an item name"),
  description: z.string().optional().nullable(),
  qty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
});

const inputSchema = z.object({
  customerId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  branch: z.string().optional().nullable(),
  soldByEmployeeId: z.string().optional().nullable(),
  discount: z.coerce.number().min(0).default(0),
  validUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

export type QuotationInput = z.input<typeof inputSchema>;
export type QuotationResult = { ok: true; id: string } | { ok: false; error: string };

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function parseValidUntil(v: string | null | undefined): Date | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shared writer for create + update. When `id` is null it mints a new number. */
async function persist(input: QuotationInput, id: string | null): Promise<QuotationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid quotation data" };
  }
  const data = parsed.data;
  const session = await requireUser();

  const totals = sumLines(
    data.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
    data.discount || 0,
  );

  const items = data.lines.map((l) => ({
    productId: clean(l.productId),
    model: clean(l.model),
    name: l.name.trim(),
    description: clean(l.description),
    qty: l.qty,
    unitPrice: round2(l.unitPrice),
    lineTotal: round2(l.qty * l.unitPrice),
  }));

  const header = {
    customerId: clean(data.customerId),
    customerName: clean(data.customerName),
    address: clean(data.address),
    phone: clean(data.phone),
    branch: clean(data.branch),
    soldByEmployeeId: clean(data.soldByEmployeeId),
    discount: totals.discount,
    subtotal: totals.subtotal,
    grandTotal: totals.grandTotal,
    validUntil: parseValidUntil(data.validUntil),
    notes: clean(data.notes),
  };

  try {
    if (id) {
      // Replace lines wholesale — simplest correct edit for a small line count.
      await prisma.$transaction(async (tx) => {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        await tx.quotation.update({
          where: { id },
          data: { ...header, items: { create: items } },
        });
      });
      revalidatePath("/quotations");
      revalidatePath(`/quotations/${id}`);
      return { ok: true, id };
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const quotationNumber = await generateQuotationNumber(tx);
          return tx.quotation.create({
            data: {
              quotationNumber,
              createdByUserId: session.id,
              ...header,
              items: { create: items },
            },
          });
        });
        revalidatePath("/quotations");
        return { ok: true, id: created.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) {
          continue; // retry quotation number
        }
        throw e;
      }
    }
    return { ok: false, error: "Could not generate a quotation number. Please try again." };
  } catch (e) {
    console.error("save quotation failed", e);
    return { ok: false, error: "Could not save the quotation. Please try again." };
  }
}

export async function createQuotation(input: QuotationInput): Promise<QuotationResult> {
  return persist(input, null);
}

export async function updateQuotation(id: string, input: QuotationInput): Promise<QuotationResult> {
  return persist(input, id);
}

const STATUSES: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];

export async function setQuotationStatus(
  id: string,
  status: QuotationStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!STATUSES.includes(status)) return { ok: false, error: "Invalid status" };
  try {
    await prisma.quotation.update({ where: { id }, data: { status } });
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    return { ok: true };
  } catch (e) {
    console.error("setQuotationStatus failed", e);
    return { ok: false, error: "Could not update the status." };
  }
}

/** Bound + called from the detail page; redirects on success. */
export async function deleteQuotation(id: string): Promise<{ error?: string } | void> {
  await requireUser();
  try {
    await prisma.quotation.delete({ where: { id } });
  } catch (e) {
    console.error("deleteQuotation failed", e);
    return { error: "Could not delete the quotation." };
  }
  revalidatePath("/quotations");
  redirect("/quotations");
}
