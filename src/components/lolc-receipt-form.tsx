"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import type { LolcActionState } from "@/app/(app)/lolc-receipt/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function LolcReceiptForm({
  action,
  initialDate,
  submissionKey,
}: {
  action: (previous: LolcActionState, formData: FormData) => Promise<LolcActionState>;
  initialDate: string;
  submissionKey: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <Card>
        <CardContent className="space-y-5">
          {state.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>}
          <div className="rounded-lg border border-primary/20 bg-primary-soft/60 px-4 py-3 text-sm text-primary-ink">
            Saving creates a permanent receipt number. Corrections are made by voiding and reissuing—not editing.
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Label htmlFor="customerName">Customer name</Label>
              <Input id="customerName" name="customerName" maxLength={160} placeholder="Customer's full name" required autoFocus />
            </div>
            <div>
              <Label htmlFor="collectedDate">Collection date</Label>
              <Input id="collectedDate" name="collectedDate" type="date" defaultValue={initialDate} required />
            </div>
            <div>
              <Label htmlFor="lolcCode">LOLC code</Label>
              <Input id="lolcCode" name="lolcCode" maxLength={100} placeholder="Agreement / payment code" required />
            </div>
            <div>
              <Label htmlFor="customerPhone">Phone number</Label>
              <Input id="customerPhone" name="customerPhone" type="tel" inputMode="tel" maxLength={30} placeholder="e.g. 0771234567" required />
            </div>
            <div>
              <Label htmlFor="amount">Amount collected (LKR)</Label>
              <Input id="amount" name="amount" type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" placeholder="0.00" required />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" name="note" maxLength={500} placeholder="Any additional collection information" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted">Operational tracking only — excluded from business accounts and shift cash.</p>
            <Button type="submit" disabled={pending}><Save className="h-4 w-4" />{pending ? "Saving…" : "Save receipt"}</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
