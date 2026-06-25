"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { validateLkPhone } from "@/lib/phone";

export type CustomerFormState = { error?: string; duplicate?: boolean };

/** Returns the id of an existing customer using this (normalized) phone, if any. */
async function findPhoneOwner(phone: string, excludeId?: string): Promise<string | null> {
  const existing = await prisma.customer.findFirst({
    where: { phone, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
  return existing?.id ?? null;
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  nic: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  nicFrontKey: z.string().optional(),
  nicBackKey: z.string().optional(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    nic: formData.get("nic") || undefined,
    address: formData.get("address") || undefined,
    email: formData.get("email") || undefined,
    nicFrontKey: formData.get("nicFrontKey") || undefined,
    nicBackKey: formData.get("nicBackKey") || undefined,
  });
}

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const phoneCheck = validateLkPhone(d.phone);
  if (!phoneCheck.ok) return { error: phoneCheck.error };

  const override = formData.get("confirmDuplicate") === "on";
  if (!override && (await findPhoneOwner(phoneCheck.normalized))) {
    return { error: "A customer with this phone number already exists.", duplicate: true };
  }

  const c = await prisma.customer.create({
    data: {
      name: d.name.trim(),
      phone: phoneCheck.normalized,
      nic: d.nic?.trim() || null,
      address: d.address?.trim() || null,
      email: d.email?.trim() || null,
      nicFrontKey: d.nicFrontKey || null,
      nicBackKey: d.nicBackKey || null,
    },
  });
  revalidatePath("/customers");
  redirect(`/customers/${c.id}`);
}

export async function updateCustomer(
  id: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const phoneCheck = validateLkPhone(d.phone);
  if (!phoneCheck.ok) return { error: phoneCheck.error };

  const override = formData.get("confirmDuplicate") === "on";
  if (!override && (await findPhoneOwner(phoneCheck.normalized, id))) {
    return { error: "Another customer with this phone number already exists.", duplicate: true };
  }

  await prisma.customer.update({
    where: { id },
    data: {
      name: d.name.trim(),
      phone: phoneCheck.normalized,
      nic: d.nic?.trim() || null,
      address: d.address?.trim() || null,
      email: d.email?.trim() || null,
      nicFrontKey: d.nicFrontKey || null,
      nicBackKey: d.nicBackKey || null,
    },
  });
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export type QuickCustomerResult =
  | { ok: true; customer: { id: string; name: string; phone: string } }
  | { ok: false; error: string; duplicate?: boolean };

export async function quickCreateCustomer(data: {
  name: string;
  phone: string;
  nic?: string;
  confirmDuplicate?: boolean;
}): Promise<QuickCustomerResult> {
  if (!data.name.trim() || !data.phone.trim()) {
    return { ok: false, error: "Name and phone are required" };
  }
  const phoneCheck = validateLkPhone(data.phone);
  if (!phoneCheck.ok) return { ok: false, error: phoneCheck.error };

  if (!data.confirmDuplicate && (await findPhoneOwner(phoneCheck.normalized))) {
    return {
      ok: false,
      error: "A customer with this phone number already exists.",
      duplicate: true,
    };
  }

  try {
    const c = await prisma.customer.create({
      data: {
        name: data.name.trim(),
        phone: phoneCheck.normalized,
        nic: data.nic?.trim() || null,
      },
      select: { id: true, name: true, phone: true },
    });
    revalidatePath("/customers");
    return { ok: true, customer: c };
  } catch (e) {
    console.error("quickCreateCustomer failed", e);
    return { ok: false, error: "Failed to create customer." };
  }
}
