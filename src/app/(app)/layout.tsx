import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setting] = await Promise.all([requireUser(), getSettings()]);
  return (
    <AppShell
      user={user}
      businessName={setting?.businessName ?? "Madagama"}
    >
      {children}
    </AppShell>
  );
}
