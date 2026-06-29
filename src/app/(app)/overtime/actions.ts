"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { round2 } from "@/lib/utils";

export type OvertimeState = { error?: string; ok?: boolean };

/** Overtime affects pay — admin only (same policy as commissions/payroll). */
async function requireAdminState(): Promise<{ error: string } | null> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") return { error: "Only an admin can record overtime." };
  return null;
}

const schema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  hours: z.coerce.number().positive("Enter the hours worked"),
  rate: z.coerce.number().positive("Enter the hourly rate"),
  date: z.string().optional(),
  reason: z.string().optional(),
});

export async function createOvertime(
  _prev: OvertimeState,
  formData: FormData,
): Promise<OvertimeState> {
  const denied = await requireAdminState();
  if (denied) return denied;

  const parsed = schema.safeParse({
    employeeId: formData.get("employeeId"),
    hours: formData.get("hours"),
    rate: formData.get("rate"),
    date: formData.get("date") || undefined,
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  try {
    await prisma.overtime.create({
      data: {
        employeeId: d.employeeId,
        hours: d.hours,
        rate: d.rate,
        amount: round2(d.hours * d.rate),
        reason: d.reason?.trim() || null,
        date: d.date ? new Date(d.date) : new Date(),
      },
    });
  } catch (e) {
    console.error("createOvertime failed", e);
    return { error: "Could not save the overtime. Please try again." };
  }

  revalidatePath("/overtime");
  return { ok: true };
}

export async function deleteOvertime(id: string) {
  const me = await getSession();
  if (!me || me.role !== "ADMIN") throw new Error("Not authorized.");
  await prisma.overtime.delete({ where: { id } });
  revalidatePath("/overtime");
}
