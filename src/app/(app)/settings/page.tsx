import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { UsersManager } from "@/components/users-manager";
import { SystemReset } from "@/components/system-reset";
import { getSession } from "@/lib/auth";
import { toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";
  const [s, users] = await Promise.all([
    prisma.setting.findUnique({ where: { id: 1 } }),
    isAdmin
      ? prisma.user.findMany({
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select: { id: true, name: true, email: true, role: true, active: true, pin: true },
        })
      : Promise.resolve([]),
  ]);

  const userRows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    hasPin: !!u.pin,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Settings" subtitle="Business, tax, credit and SMS configuration" />
      <SettingsForm
        isAdmin={isAdmin}
        initial={{
          businessName: s?.businessName ?? "Madagama Pvt Ltd",
          address: s?.address ?? "",
          phone: s?.phone ?? "",
          email: s?.email ?? "",
          interestRatePct: Math.round(toNum(s?.interestRatePerMonth ?? 0.02) * 10000) / 100,
          interestFreeMonths: s?.interestFreeMonths ?? 4,
          smsSenderId: s?.smsSenderId ?? "Madagama",
          smsEnabled: s?.smsEnabled ?? false,
          textlkApiToken: s?.textlkApiToken ?? "",
          reminderDayOfMonth: s?.reminderDayOfMonth ?? 1,
          nonTaxableEnabled: s?.nonTaxableEnabled ?? true,
          defaultTargetMarginPct: toNum(s?.defaultTargetMarginPct ?? 20),
          epfEmployeePct: Math.round(toNum(s?.epfEmployeeRate ?? 0.08) * 10000) / 100,
          epfEmployerPct: Math.round(toNum(s?.epfEmployerRate ?? 0.12) * 10000) / 100,
          etfPct: Math.round(toNum(s?.etfRate ?? 0.03) * 10000) / 100,
        }}
      />
      {isAdmin && session && <UsersManager users={userRows} currentUserId={session.id} />}
      {isAdmin && <SystemReset />}
    </div>
  );
}
