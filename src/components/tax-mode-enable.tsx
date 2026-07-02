"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { enableNonTaxable, type TaxModeState } from "@/app/(app)/settings/tax-mode-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TaxModeEnable() {
  const [state, action, pending] = useActionState<TaxModeState, FormData>(enableNonTaxable, {});
  const router = useRouter();

  // On success the server page re-renders into its "already enabled" state.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enable non-taxable mode</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state.error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {state.error}
            </div>
          )}
          {state.ok && (
            <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">
              Non-taxable mode is back on — everything is visible again.
            </div>
          )}
          <p className="text-sm text-muted">
            Non-taxable products &amp; invoices are currently <b>hidden system-wide</b>. Enabling
            makes every non-taxable product, invoice, report figure and filter reappear exactly as
            before — nothing was deleted. Confirm with your password to continue.
          </p>
          <div className="max-w-xs">
            <Label htmlFor="password">Your password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Enabling…" : "Enable non-taxable mode"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
