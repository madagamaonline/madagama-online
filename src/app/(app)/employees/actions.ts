"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export type EmployeeFormState = { error?: string };

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  nic: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  position: z.string().optional(),
  dailyRate: z.coerce.number().min(0),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    nic: formData.get("nic") || undefined,
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
    position: formData.get("position") || undefined,
    dailyRate: formData.get("dailyRate") || 0,
  });
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await prisma.employee.create({
    data: {
      name: d.name.trim(),
      nic: d.nic?.trim() || null,
      phone: d.phone?.trim() || null,
      address: d.address?.trim() || null,
      position: d.position?.trim() || null,
      dailyRate: d.dailyRate,
    },
  });
  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployee(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await prisma.employee.update({
    where: { id },
    data: {
      name: d.name.trim(),
      nic: d.nic?.trim() || null,
      phone: d.phone?.trim() || null,
      address: d.address?.trim() || null,
      position: d.position?.trim() || null,
      dailyRate: d.dailyRate,
    },
  });
  revalidatePath("/employees");
  redirect("/employees");
}

export async function toggleEmployeeActive(id: string, active: boolean) {
  await prisma.employee.update({ where: { id }, data: { active } });
  revalidatePath("/employees");
}
