"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type CommissionState = { error?: string; ok?: boolean };

/** Commissions affect pay — admin only (same policy as overtime/payroll). */
async function requireAdminState(): Promise<{ error: string } | null> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") return { error: "Only an admin can manage commissions." };
  return null;
}

const schema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  amount: z.coerce.number().positive("Enter a valid amount"),
  reason: z.string().min(1, "Reason is required"),
  date: z.string().optional(),
});

export async function createCommission(
  _prev: CommissionState,
  formData: FormData,
): Promise<CommissionState> {
  const denied = await requireAdminState();
  if (denied) return denied;
  const parsed = schema.safeParse({
    employeeId: formData.get("employeeId"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
    date: formData.get("date") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  await prisma.commission.create({
    data: {
      employeeId: d.employeeId,
      amount: d.amount,
      reason: d.reason.trim(),
      date: d.date ? new Date(d.date) : new Date(),
    },
  });

  revalidatePath("/commissions");
  return { ok: true };
}

export async function deleteCommission(id: string) {
  const me = await getSession();
  if (!me || me.role !== "ADMIN") throw new Error("Not authorized.");
  await prisma.commission.delete({ where: { id } });
  revalidatePath("/commissions");
}
