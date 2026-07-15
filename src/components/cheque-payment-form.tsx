"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { recordChequePayment, type BankingActionState } from "@/app/(app)/banking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";

const initial: BankingActionState = {};

export function ChequePaymentForm({ chequeId, remaining }: { chequeId: string; remaining: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(recordChequePayment.bind(null, chequeId), initial);
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => { if (state.ok) formRef.current?.reset(); }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Repayment recorded. The balance has been updated.</p>}
      <div><Label htmlFor="cheque-payment-amount">Amount (LKR)</Label><NumberInput id="cheque-payment-amount" name="amount" min="0.01" max={remaining} required /></div>
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="cheque-payment-date">Paid date</Label><Input id="cheque-payment-date" name="paidDate" type="date" defaultValue={today} required /></div><div><Label htmlFor="cheque-payment-note">Note (optional)</Label><Input id="cheque-payment-note" name="note" /></div></div>
      <Button className="w-full" type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "Recording…" : "Record repayment"}</Button>
    </form>
  );
}
