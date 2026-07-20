"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type VehicleActionState = { error?: string; ok?: boolean };

export function VehiclePaymentForm({ action, outstanding }: { action: (previous: VehicleActionState, data: FormData) => Promise<VehicleActionState>; outstanding: number }) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) formRef.current?.reset(); }, [state.ok]);
  return <form ref={formRef} action={formAction} className="space-y-3">
    <div aria-live="polite">{state.error ? <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div> : null}{state.ok ? <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Customer payment recorded.</div> : null}</div>
    <div><Label htmlFor="customer-payment-amount">Amount (LKR)</Label><NumberInput id="customer-payment-amount" name="amount" min={0.01} max={outstanding} required /></div>
    <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="customer-payment-date">Date</Label><Input id="customer-payment-date" name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div><div><Label htmlFor="customer-payment-method">Method</Label><Select id="customer-payment-method" name="method" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="CARD">Card</option></Select></div></div>
    <div><Label htmlFor="customer-payment-reference">Reference</Label><Input id="customer-payment-reference" name="reference" className="font-mono" placeholder="Optional" /></div>
    <div><Label htmlFor="customer-payment-note">Note</Label><Input id="customer-payment-note" name="note" placeholder="Optional" /></div>
    <Button type="submit" className="w-full" disabled={pending || outstanding <= 0}>{pending ? "Recording…" : outstanding <= 0 ? "Account fully collected" : "Record customer payment"}</Button>
  </form>;
}
