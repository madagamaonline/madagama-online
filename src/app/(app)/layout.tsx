import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Auth (cookie/JWT only) and the settings read have no dependency on each
  // other — run them together instead of one after the other.
  const [user, setting] = await Promise.all([requireUser(), getSettings()]);
  return (
    <AppShell
      user={user}
      businessName={setting?.businessName ?? "Madagama"}
      nonTaxableEnabled={setting?.nonTaxableEnabled ?? true}
    >
      {children}
    </AppShell>
  );
}
