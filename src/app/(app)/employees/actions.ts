"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type EmployeeFormState = { error?: string };

/** Employee records (incl. daily pay rates) are payroll master data — admin only. */
async function requireAdminState(): Promise<{ error: string } | null> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") return { error: "Only an admin can manage employees." };
  return null;
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  nic: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  position: z.string().optional(),
  dailyRate: z.coerce.number().min(0),
  epfEtfMember: z.boolean(),
  epfNumber: z.string().optional(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    nic: formData.get("nic") || undefined,
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
    position: formData.get("position") || undefined,
    dailyRate: formData.get("dailyRate") || 0,
    epfEtfMember: formData.get("epfEtfMember") === "on",
    epfNumber: formData.get("epfNumber") || undefined,
  });
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const denied = await requireAdminState();
  if (denied) return denied;
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    await prisma.employee.create({
      data: {
        name: d.name.trim(),
        nic: d.nic?.trim() || null,
        phone: d.phone?.trim() || null,
        address: d.address?.trim() || null,
        position: d.position?.trim() || null,
        dailyRate: d.dailyRate,
        epfEtfMember: d.epfEtfMember,
        epfNumber: d.epfNumber?.trim() || null,
      },
    });
  } catch (e) {
    console.error("createEmployee failed", e);
    return { error: "Could not save the employee. Please try again." };
  }
  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployee(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const denied = await requireAdminState();
  if (denied) return denied;
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    await prisma.employee.update({
      where: { id },
      data: {
        name: d.name.trim(),
        nic: d.nic?.trim() || null,
        phone: d.phone?.trim() || null,
        address: d.address?.trim() || null,
        position: d.position?.trim() || null,
        dailyRate: d.dailyRate,
        epfEtfMember: d.epfEtfMember,
        epfNumber: d.epfNumber?.trim() || null,
      },
    });
  } catch (e) {
    console.error("updateEmployee failed", e);
    return { error: "Could not update the employee. Please try again." };
  }
  revalidatePath("/employees");
  redirect("/employees");
}

export async function toggleEmployeeActive(id: string, active: boolean) {
  const me = await getSession();
  if (!me || me.role !== "ADMIN") throw new Error("Not authorized.");
  await prisma.employee.update({ where: { id }, data: { active } });
  revalidatePath("/employees");
}
