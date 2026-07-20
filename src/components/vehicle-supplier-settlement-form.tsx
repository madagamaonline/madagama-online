"use client";

import { useActionState, useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { VehicleActionState } from "@/components/vehicle-payment-form";

export function VehicleSupplierSettlementForm({ action, outstanding, supplierName }: { action: (previous: VehicleActionState, data: FormData) => Promise<VehicleActionState>; outstanding: number; supplierName: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) formRef.current?.reset(); }, [state.ok]);
  return <form ref={formRef} action={formAction} className="space-y-3">
    <div className="flex items-start gap-2 rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>This pays <strong>{supplierName}</strong>. It does not change the customer balance.</span></div>
    <div aria-live="polite">{state.error ? <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div> : null}{state.ok ? <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Supplier settlement recorded.</div> : null}</div>
    <div><Label htmlFor="supplier-settlement-amount">Amount (LKR)</Label><NumberInput id="supplier-settlement-amount" name="amount" min={0.01} max={outstanding} required /></div>
    <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="supplier-settlement-date">Date</Label><Input id="supplier-settlement-date" name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div><div><Label htmlFor="supplier-settlement-method">Method</Label><Select id="supplier-settlement-method" name="method" defaultValue="BANK"><option value="BANK">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="CASH">Cash</option><option value="CARD">Card</option></Select></div></div>
    <div><Label htmlFor="supplier-settlement-reference">Reference / cheque number</Label><Input id="supplier-settlement-reference" name="reference" className="font-mono" /></div>
    <div><Label htmlFor="supplier-settlement-note">Note</Label><Input id="supplier-settlement-note" name="note" placeholder="Optional" /></div>
    <Button type="submit" className="w-full" disabled={pending || outstanding <= 0}>{pending ? "Recording…" : outstanding <= 0 ? "Supplier fully paid" : "Record supplier settlement"}</Button>
  </form>;
}
