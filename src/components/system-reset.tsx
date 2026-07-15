"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  resetSystemData,
  type ResetState,
} from "@/app/(app)/settings/danger-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Must match CONFIRM_PHRASE in danger-actions.ts.
const CONFIRM_PHRASE = "DELETE ALL DATA";

const initial: ResetState = {};

export function SystemReset() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [state, action, pending] = useActionState(resetSystemData, initial);

  useEffect(() => {
    // On success the success branch below takes over the render regardless of
    // `armed`, so we only need to re-sync the rest of the app: the data is gone,
    // refresh so every cached page reflects the now-empty database.
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <Card className="border-danger/40">
      <CardHeader className="border-danger/20">
        <CardTitle className="flex items-center gap-2 text-danger">
          <AlertTriangle className="h-4 w-4" /> Danger zone — system cleanup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-muted">
          <p>
            This permanently deletes <strong>all business data</strong> — products,
            customers, invoices, credit agreements &amp; payments, purchases, suppliers,
            bank accounts, supplier cheques and repayments, employees, payroll, expenses,
            service jobs, stock history and notifications.
          </p>
          <p>
            Your <strong>login accounts</strong> and <strong>business settings</strong>{" "}
            are kept, so you can sign back in and start fresh. This action{" "}
            <strong>cannot be undone</strong>.
          </p>
        </div>

        {state.ok ? (
          <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">
            ✓ All business data has been cleared
            {typeof state.cleared === "number" ? ` (${state.cleared} tables)` : ""}. You now
            have a clean slate.
          </div>
        ) : !armed ? (
          <Button type="button" variant="danger" onClick={() => setArmed(true)}>
            <Trash2 className="h-4 w-4" /> Delete all data…
          </Button>
        ) : (
          <form action={action} className="space-y-3 rounded-lg bg-danger-soft/60 p-3">
            <p className="text-sm font-medium text-danger">
              Are you absolutely sure? To confirm, type{" "}
              <span className="font-mono">{CONFIRM_PHRASE}</span> and enter your password.
            </p>
            <div>
              <Label htmlFor="reset-phrase">Confirmation</Label>
              <Input
                id="reset-phrase"
                name="confirmPhrase"
                autoComplete="off"
                placeholder={CONFIRM_PHRASE}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reset-password">Your password</Label>
              <Input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Admin password"
              />
            </div>
            {state.error && <p className="text-sm text-danger">{state.error}</p>}
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="danger"
                disabled={pending || phrase.trim() !== CONFIRM_PHRASE}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {pending ? "Deleting…" : "Permanently delete everything"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setArmed(false);
                  setPhrase("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
