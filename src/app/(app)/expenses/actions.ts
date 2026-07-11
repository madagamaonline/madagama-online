"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActionAdmin } from "@/lib/auth";

export type ExpenseState = { error?: string; ok?: boolean };

const schema = z.object({
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Enter a valid amount"),
  date: z.string().optional(),
  description: z.string().optional(),
});

export async function createExpense(
  _prev: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  await requireActionAdmin();
  const parsed = schema.safeParse({
    category: formData.get("category"),
    amount: formData.get("amount"),
    date: formData.get("date") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  await prisma.expense.create({
    data: {
      category: d.category.trim(),
      amount: d.amount,
      date: d.date ? new Date(d.date) : new Date(),
      description: d.description?.trim() || null,
    },
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

export async function deleteExpense(id: string) {
  await requireActionAdmin();
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/expenses");
  revalidatePath("/reports");
}
