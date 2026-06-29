"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type AdvanceState = { error?: string; ok?: boolean };

/** Advances are money paid out against future pay — admin only. */
async function requireAdminState(): Promise<{ error: string } | null> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") return { error: "Only an admin can record salary advances." };
  return null;
}

const schema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  amount: z.coerce.number().positive("Enter a valid amount"),
  date: z.string().optional(),
  note: z.string().optional(),
});

export async function createAdvance(
  _prev: AdvanceState,
  formData: FormData,
): Promise<AdvanceState> {
  const denied = await requireAdminState();
  if (denied) return denied;

  const parsed = schema.safeParse({
    employeeId: formData.get("employeeId"),
    amount: formData.get("amount"),
    date: formData.get("date") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  try {
    await prisma.salaryAdvance.create({
      data: {
        employeeId: d.employeeId,
        amount: d.amount,
        note: d.note?.trim() || null,
        date: d.date ? new Date(d.date) : new Date(),
      },
    });
  } catch (e) {
    console.error("createAdvance failed", e);
    return { error: "Could not save the advance. Please try again." };
  }

  revalidatePath("/advances");
  return { ok: true };
}

export async function deleteAdvance(id: string) {
  const me = await getSession();
  if (!me || me.role !== "ADMIN") throw new Error("Not authorized.");
  // Only un-recovered advances can be removed; recovered ones are tied to a
  // saved payroll run and must be released by regenerating that run first.
  await prisma.salaryAdvance.deleteMany({ where: { id, status: "OUTSTANDING" } });
  revalidatePath("/advances");
}
