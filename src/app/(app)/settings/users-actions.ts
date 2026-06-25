"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";

export type UserFormState = { error?: string; ok?: boolean };

const roleEnum = z.enum(["ADMIN", "STAFF"]);

async function ensureAdmin(): Promise<{ id: string } | { error: string }> {
  const me = await getSession();
  if (!me || me.role !== "ADMIN") return { error: "Not authorized." };
  return { id: me.id };
}

/** True when demoting/deactivating `userId` would leave zero active admins. */
async function wouldRemoveLastAdmin(userId: string): Promise<boolean> {
  const others = await prisma.user.count({
    where: { role: "ADMIN", active: true, NOT: { id: userId } },
  });
  return others === 0;
}

const PIN_RE = /^\d{4}$/;

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: roleEnum,
});

export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const auth = await ensureAdmin();
  if ("error" in auth) return auth;

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const email = d.email.trim().toLowerCase();

  const pin = (formData.get("pin") as string | null)?.trim() || "";
  if (pin && !PIN_RE.test(pin)) return { error: "PIN must be exactly 4 digits." };

  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "A user with this email already exists." };
  }

  try {
    await prisma.user.create({
      data: {
        name: d.name.trim(),
        email,
        passwordHash: await hashPassword(d.password),
        role: d.role,
        pin: pin || null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A user with this email already exists." };
    }
    throw e;
  }

  revalidatePath("/settings");
  return { ok: true };
}

const updateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().optional(),
  role: roleEnum,
  active: z.boolean(),
});

export async function updateUser(
  id: string,
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const auth = await ensureAdmin();
  if ("error" in auth) return auth;

  const passwordRaw = (formData.get("password") as string | null)?.trim() || "";
  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: passwordRaw || undefined,
    role: formData.get("role"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const email = d.email.trim().toLowerCase();

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };

  // You can't lock yourself out.
  if (id === auth.id && (!d.active || d.role !== "ADMIN")) {
    return { error: "You can't remove your own admin access or deactivate yourself." };
  }

  // Don't allow removing the last active admin.
  const stillAdmin = d.role === "ADMIN" && d.active;
  if (!stillAdmin && target.role === "ADMIN" && target.active && (await wouldRemoveLastAdmin(id))) {
    return { error: "At least one active admin is required." };
  }

  // Email must stay unique.
  const clash = await prisma.user.findFirst({ where: { email, NOT: { id } }, select: { id: true } });
  if (clash) return { error: "Another user already uses this email." };

  if (passwordRaw && passwordRaw.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const pinRaw = (formData.get("pin") as string | null)?.trim() || "";
  if (pinRaw && !PIN_RE.test(pinRaw)) return { error: "PIN must be exactly 4 digits." };

  await prisma.user.update({
    where: { id },
    data: {
      name: d.name.trim(),
      email,
      role: d.role,
      active: d.active,
      ...(passwordRaw ? { passwordHash: await hashPassword(passwordRaw) } : {}),
      ...(pinRaw ? { pin: pinRaw } : {}),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteUser(id: string): Promise<UserFormState> {
  const auth = await ensureAdmin();
  if ("error" in auth) return auth;

  if (id === auth.id) return { error: "You can't delete your own account." };

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };

  if (target.role === "ADMIN" && target.active && (await wouldRemoveLastAdmin(id))) {
    return { error: "At least one active admin is required." };
  }

  // Invoices/payments reference the user via optional FKs (set null on delete),
  // so history is preserved — only the "created by" attribution is cleared.
  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}
