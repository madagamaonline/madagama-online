import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { TaxModeEnable } from "@/components/tax-mode-enable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Unlisted admin-only page for re-enabling non-taxable mode. Deliberately not
 * linked from any nav, settings card or the command palette — once the switch
 * is off, the only way back is knowing this URL (plus an admin password).
 */
export default async function TaxModePage() {
  await requireAdmin();
  const s = await prisma.setting.findUnique({
    where: { id: 1 },
    select: { nonTaxableEnabled: true },
  });
  const enabled = s?.nonTaxableEnabled ?? true;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Tax mode" subtitle="Non-taxable products & invoices" />
      {enabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Non-taxable mode is on</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted">
              Non-taxable products &amp; invoices are currently visible everywhere. To turn them
              off, use the &ldquo;Tax mode&rdquo; card on the Settings page.
            </p>
            <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
              Back to Settings
            </Link>
          </CardContent>
        </Card>
      ) : (
        <TaxModeEnable />
      )}
    </div>
  );
}
