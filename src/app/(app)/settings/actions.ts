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
  defaultTargetMarginPct: z.coerce.number().min(0).max(99),
  epfEmployeePct: z.coerce.number().min(0).max(100),
  epfEmployerPct: z.coerce.number().min(0).max(100),
  etfPct: z.coerce.number().min(0).max(100),
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
    defaultTargetMarginPct: formData.get("defaultTargetMarginPct") || 20,
    epfEmployeePct: formData.get("epfEmployeePct") ?? 8,
    epfEmployerPct: formData.get("epfEmployerPct") ?? 12,
    etfPct: formData.get("etfPct") ?? 3,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Defense in depth: don't rely on the middleware alone — verify a real session
  // here too, since a server action is just a POST endpoint.
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  const isAdmin = me.role === "ADMIN";
  const nonTaxableEnabled = formData.get("nonTaxableEnabled") === "on";

  // Money- and credential-sensitive fields are admin-only. Non-admins use the
  // same form but never see these inputs, so we must NOT let their submission
  // overwrite the stored values — only apply them when the user is an admin.
  // (This is the same guard the non-taxable kill-switch already uses.)
  const adminOnly = isAdmin
    ? {
        interestRatePerMonth: d.interestRatePct / 100,
        interestFreeMonths: d.interestFreeMonths,
        textlkApiToken: d.textlkApiToken?.trim() || null,
        nonTaxableEnabled,
        defaultTargetMarginPct: d.defaultTargetMarginPct,
        epfEmployeeRate: d.epfEmployeePct / 100,
        epfEmployerRate: d.epfEmployerPct / 100,
        etfRate: d.etfPct / 100,
      }
    : {};

  await prisma.setting.update({
    where: { id: 1 },
    data: {
      businessName: d.businessName.trim(),
      address: d.address?.trim() ?? "",
      phone: d.phone?.trim() ?? "",
      email: d.email?.trim() ?? "",
      smsSenderId: d.smsSenderId?.trim() || "Madagama",
      smsEnabled: d.smsEnabled,
      reminderDayOfMonth: d.reminderDayOfMonth,
      ...adminOnly,
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
