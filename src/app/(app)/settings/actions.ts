"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type SettingsState = { error?: string; ok?: boolean };

const schema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  interestRatePct: z.coerce.number().min(0).max(100),
  interestFreeMonths: z.coerce.number().int().min(0).max(60),
  smsSenderId: z.string().optional(),
  smsEnabled: z.boolean(),
  textlkApiToken: z.string().optional(),
  reminderDayOfMonth: z.coerce.number().int().min(1).max(28),
});

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = schema.safeParse({
    businessName: formData.get("businessName"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    interestRatePct: formData.get("interestRatePct"),
    interestFreeMonths: formData.get("interestFreeMonths"),
    smsSenderId: formData.get("smsSenderId") || undefined,
    smsEnabled: formData.get("smsEnabled") === "on",
    textlkApiToken: formData.get("textlkApiToken") ?? undefined,
    reminderDayOfMonth: formData.get("reminderDayOfMonth"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // The non-taxable kill-switch is admin-only. Non-admins never see the toggle,
  // so we must NOT let a missing checkbox (which reads as "off") overwrite it —
  // only apply the change when the current user is an admin.
  const me = await getSession();
  const isAdmin = me?.role === "ADMIN";
  const nonTaxableEnabled = formData.get("nonTaxableEnabled") === "on";

  await prisma.setting.update({
    where: { id: 1 },
    data: {
      businessName: d.businessName.trim(),
      address: d.address?.trim() ?? "",
      phone: d.phone?.trim() ?? "",
      email: d.email?.trim() ?? "",
      interestRatePerMonth: d.interestRatePct / 100,
      interestFreeMonths: d.interestFreeMonths,
      smsSenderId: d.smsSenderId?.trim() || "Madagama",
      smsEnabled: d.smsEnabled,
      textlkApiToken: d.textlkApiToken?.trim() || null,
      reminderDayOfMonth: d.reminderDayOfMonth,
      ...(isAdmin ? { nonTaxableEnabled } : {}),
    },
  });

  // The switch changes what every page shows, so refresh the common surfaces.
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/invoices");
  revalidatePath("/reports");
  return { ok: true };
}
