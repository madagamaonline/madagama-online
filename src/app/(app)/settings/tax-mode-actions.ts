"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, verifyPassword } from "@/lib/auth";

export type TaxModeState = { error?: string; ok?: boolean };

/**
 * Re-enables non-taxable products & invoices system-wide.
 *
 * The Settings form can only turn the switch OFF (and then hides the card
 * entirely), so this action is the sole way back ON. It lives behind the
 * unlisted /settings/tax-mode page and requires the admin to re-enter their
 * password — a 4-digit till PIN can switch into an admin session, so the
 * session alone isn't trusted, mirroring the danger-zone guard.
 */
export async function enableNonTaxable(
  _prev: TaxModeState,
  formData: FormData,
): Promise<TaxModeState> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") {
    return { error: "Only an admin can enable non-taxable mode." };
  }

  const password = (formData.get("password") as string | null) ?? "";
  if (!password) return { error: "Enter your password to confirm." };

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return { error: "Account not found — please sign in again." };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect password." };
  }

  await prisma.setting.update({
    where: { id: 1 },
    data: { nonTaxableEnabled: true },
  });

  // The switch changes what every page shows, so refresh the common surfaces.
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/invoices");
  revalidatePath("/reports");
  return { ok: true };
}
