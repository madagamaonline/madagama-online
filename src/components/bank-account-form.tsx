"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Loader2 } from "lucide-react";
import { createBankAccount, type BankingActionState } from "@/app/(app)/banking/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";

const initial: BankingActionState = {};

export function BankAccountForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createBankAccount, initial);
  useEffect(() => {
    if (state.ok) router.push("/banking");
  }, [state, router]);

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Account identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="bankName">Bank name</Label><Input id="bankName" name="bankName" placeholder="e.g. Bank of Ceylon" required /></div>
            <div><Label htmlFor="accountName">Account name</Label><Input id="accountName" name="accountName" placeholder="e.g. Main current account" required /></div>
            <div><Label htmlFor="accountNumber">Account number</Label><Input id="accountNumber" name="accountNumber" className="font-mono" required /></div>
            <div><Label htmlFor="branch">Branch (optional)</Label><Input id="branch" name="branch" /></div>
          </div>
          <div>
            <Label htmlFor="overdraftLimit">Overdraft limit (LKR, optional)</Label>
            <NumberInput id="overdraftLimit" name="overdraftLimit" min="0" placeholder="Leave blank if no limit is configured" />
            <p className="mt-1 text-xs text-muted">Leaving this blank means no facility limit is configured; it is not treated as zero.</p>
          </div>
          <div><Label htmlFor="notes">Notes (optional)</Label><Textarea id="notes" name="notes" rows={3} /></div>
          <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "Saving…" : "Add bank account"}</Button></div>
        </CardContent>
      </Card>
    </form>
  );
}
