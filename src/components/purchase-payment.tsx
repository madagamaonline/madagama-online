"use client";

import { useActionState, useEffect, useRef } from "react";
import { recordPurchasePayment, type PurchasePaymentState } from "@/app/(app)/purchases/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: PurchasePaymentState = {};

export function PurchasePayment({ purchaseId }: { purchaseId: string }) {
  const action = recordPurchasePayment.bind(null, purchaseId);
  const [state, formAction, pending] = useActionState(action, initial);
  const ref = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-3">
      {state.error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>}
      {state.ok && <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Payment recorded.</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="amount">Amount (LKR)</Label>
          <Input id="amount" name="amount" type="number" min="0" step="0.01" required />
        </div>
        <div>
          <Label htmlFor="paidDate">Date</Label>
          <Input id="paidDate" name="paidDate" type="date" defaultValue={today} />
        </div>
      </div>
      <div>
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Recording…" : "Record Payment"}
      </Button>
    </form>
  );
}
