"use client";

import { useActionState, useEffect, useRef } from "react";
import { recordPayment, type PaymentFormState } from "@/app/(app)/credit/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initial: PaymentFormState = {};

export function RecordPayment({ agreementId }: { agreementId: string }) {
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
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</div>
      )}
      {state.ok && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Payment recorded.</div>
      )}
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="method">Method</Label>
          <Select id="method" name="method" defaultValue="CASH">
            <option value="CASH">Cash</option>
            <option value="BANK">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CARD">Card</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" name="note" />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Recording…" : "Record Payment"}
      </Button>
    </form>
  );
}
