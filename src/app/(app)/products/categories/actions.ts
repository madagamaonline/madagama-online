"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type ActionState = { error?: string; ok?: boolean };

function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const catSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(8),
});

export async function createCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = catSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { error: "Name and code are required." };

  const code = cleanCode(parsed.data.code);
  if (!code) return { error: "Code must contain letters or numbers." };

  try {
    await prisma.category.create({ data: { name: parsed.data.name.trim(), code } });
  } catch {
    return { error: `Category code "${code}" already exists.` };
  }
  revalidatePath("/products/categories");
  return { ok: true };
}

const subSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1).max(8),
});

export async function createSubcategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = subSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { error: "Name and code are required." };

  const code = cleanCode(parsed.data.code);
  if (!code) return { error: "Code must contain letters or numbers." };

  try {
    await prisma.subcategory.create({
      data: { categoryId: parsed.data.categoryId, name: parsed.data.name.trim(), code },
    });
  } catch {
    return { error: `Subcategory code "${code}" already exists in this category.` };
  }
  revalidatePath("/products/categories");
  return { ok: true };
}

const nameCodeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(8),
});

export async function updateCategory(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = nameCodeSchema.safeParse({ name: formData.get("name"), code: formData.get("code") });
  if (!parsed.success) return { error: "Name and code are required." };
  const code = cleanCode(parsed.data.code);
  if (!code) return { error: "Code must contain letters or numbers." };
  try {
    await prisma.category.update({ where: { id }, data: { name: parsed.data.name.trim(), code } });
  } catch {
    return { error: `Category code "${code}" already exists.` };
  }
  revalidatePath("/products/categories");
  revalidatePath("/products");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionState> {
  const [products, subs] = await Promise.all([
    prisma.product.count({ where: { categoryId: id } }),
    prisma.subcategory.count({ where: { categoryId: id } }),
  ]);
  if (products > 0) return { error: "Cannot delete — this category still has products." };
  if (subs > 0) return { error: "Delete its subcategories first." };
  await prisma.category.delete({ where: { id } });
  revalidatePath("/products/categories");
  return { ok: true };
}

export async function updateSubcategory(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = nameCodeSchema.safeParse({ name: formData.get("name"), code: formData.get("code") });
  if (!parsed.success) return { error: "Name and code are required." };
  const code = cleanCode(parsed.data.code);
  if (!code) return { error: "Code must contain letters or numbers." };
  try {
    await prisma.subcategory.update({ where: { id }, data: { name: parsed.data.name.trim(), code } });
  } catch {
    return { error: `Subcategory code "${code}" already exists in this category.` };
  }
  revalidatePath("/products/categories");
  revalidatePath("/products");
  return { ok: true };
}

export async function deleteSubcategory(id: string): Promise<ActionState> {
  const products = await prisma.product.count({ where: { subcategoryId: id } });
  if (products > 0) return { error: "Cannot delete — this subcategory still has products." };
  await prisma.subcategory.delete({ where: { id } });
  revalidatePath("/products/categories");
  return { ok: true };
}
