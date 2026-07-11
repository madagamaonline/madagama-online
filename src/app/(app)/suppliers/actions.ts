"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActionAdmin } from "@/lib/auth";

export type SupplierFormState = { error?: string };

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    contactPerson: formData.get("contactPerson") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    address: formData.get("address") || undefined,
  });
}

export async function createSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireActionAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const s = await prisma.supplier.create({
    data: {
      name: d.name.trim(),
      contactPerson: d.contactPerson?.trim() || null,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      address: d.address?.trim() || null,
    },
  });
  revalidatePath("/suppliers");
  redirect(`/suppliers/${s.id}`);
}

export async function updateSupplier(
  id: string,
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireActionAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await prisma.supplier.update({
    where: { id },
    data: {
      name: d.name.trim(),
      contactPerson: d.contactPerson?.trim() || null,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      address: d.address?.trim() || null,
    },
  });
  revalidatePath("/suppliers");
  redirect(`/suppliers/${id}`);
}

export async function deleteSupplier(id: string): Promise<SupplierFormState> {
  await requireActionAdmin();
  // A supplier with purchase records can't be removed (purchases require a
  // supplier) — block it so history stays intact.
  const purchaseCount = await prisma.purchase.count({ where: { supplierId: id } });
  if (purchaseCount > 0) {
    return {
      error: "Cannot delete: this supplier has purchase records.",
    };
  }
  // Detach any products that list this supplier as their primary supplier.
  await prisma.product.updateMany({
    where: { primarySupplierId: id },
    data: { primarySupplierId: null },
  });
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
