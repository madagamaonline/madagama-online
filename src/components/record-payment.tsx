"use client";

import { useActionState, useEffect, useRef } from "react";
import { recordPayment, type PaymentFormState } from "@/app/(app)/credit/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initial: PaymentFormState = {};

export function RecordPayment({ agreementId, outstanding }: { agreementId: string; outstanding: number }) {
  const action = recordPayment.bind(null, agreementId);
  const [state, formAction, pending] = useActionState(action, initial);
  const ref = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-3">
      {state.error && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>
      )}
      {state.ok && (
        <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Account updated.</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="amount">Amount (LKR)</Label>
          <NumberInput id="amount" name="amount" max={outstanding} required />
        </div>
        <div>
          <Label htmlFor="discount">Settlement discount (optional)</Label>
          <NumberInput id="discount" name="discount" min={0} max={outstanding} />
        </div>
      </div>
      <p className="text-[11px] text-muted">
        Use the discount to waive the unpaid remainder when accepting a lower cash-price settlement. It reduces the
        balance but is not recorded as cash received.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="paidDate">Date</Label>
          <Input id="paidDate" name="paidDate" type="date" defaultValue={today} />
        </div>
        <div>
          <Label htmlFor="method">Method</Label>
          <Select id="method" name="method" defaultValue="CASH">
            <option value="CASH">Cash</option>
            <option value="BANK">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CARD">Card</option>
          </Select>
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
