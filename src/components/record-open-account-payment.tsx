"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2 } from "lucide-react";
import { recordOpenAccountPayment, type OpenAccountPaymentState } from "@/app/(app)/open-accounts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatLKR } from "@/lib/utils";

export function RecordOpenAccountPayment({ accountId, outstanding }: { accountId: string; outstanding: number }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [state, action, pending] = useActionState<OpenAccountPaymentState, FormData>(recordOpenAccountPayment, {});
  useEffect(() => { if (state.ok) { formRef.current?.reset(); router.refresh(); } }, [state.ok, router]);
  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">Outstanding: <strong>{formatLKR(outstanding)}</strong></div>
      <div><div className="flex items-center justify-between"><Label htmlFor="oa-amount">Amount</Label><button type="button" onClick={() => setAmount(String(outstanding))} className="text-xs font-semibold text-primary hover:underline">Pay full balance</button></div><Input id="oa-amount" name="amount" type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label htmlFor="oa-date">Effective date</Label><Input id="oa-date" name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div>
        <div><Label htmlFor="oa-method">Method</Label><Select id="oa-method" name="method" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="CARD">Card</option></Select></div>
      </div>
      <div><Label htmlFor="oa-note">Note (optional)</Label><Textarea id="oa-note" name="note" className="min-h-16" /></div>
      {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>}
      {state.ok && <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Payment recorded.</p>}
      <Button className="min-h-11 w-full" disabled={pending}><Banknote className="h-4 w-4" /> {pending ? "Recording…" : "Record payment"}</Button>
    </form>
  );
}
