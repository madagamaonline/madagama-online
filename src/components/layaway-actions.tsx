"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Handshake } from "lucide-react";
import { cancelLayaway, handoverLayaway, recordLayawayPayment, type LayawayActionState } from "@/app/(app)/layaways/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatLKR } from "@/lib/utils";
import { ActionButtonContent, ActionFeedback } from "@/components/ui/action-feedback";

const initial: LayawayActionState = {};
export function LayawayPaymentForm({ orderId, outstanding }: { orderId: string; outstanding: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(recordLayawayPayment, initial);
  useEffect(() => {
    if (!state.ok || !state.paymentId) return;
    window.open(`/layaways/${orderId}/receipts/${state.paymentId}`, "_blank", "noopener,noreferrer");
    router.refresh();
  }, [state, orderId, router]);
  return <form action={action} className="space-y-3">
    <input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="paidDate" value={new Date().toISOString()}/>
    <div><Label htmlFor="layaway-payment">Installment amount</Label><Input id="layaway-payment" name="amount" type="number" min=".01" max={outstanding} step=".01" required placeholder={outstanding.toFixed(2)}/><p className="mt-1 text-xs text-muted">Up to {formatLKR(outstanding)}</p></div>
    <div className="grid grid-cols-2 gap-2"><div><Label>Method</Label><Select name="method" defaultValue="CASH"><option>CASH</option><option>BANK</option><option>CHEQUE</option><option>CARD</option></Select></div><div><Label>Reference</Label><Input name="reference" placeholder="Optional"/></div></div>
    <div><Label>Note</Label><Input name="note" placeholder="Optional"/></div>
    <ActionFeedback error={state.error} success={state.ok ? "Payment saved. Receipt opened for printing." : undefined} />
    <Button className="w-full" disabled={pending}><ActionButtonContent pending={pending} success={state.ok} idleLabel="Record installment & receipt" pendingLabel="Recording…" successLabel="Installment saved" idleIcon={<Banknote className="h-4 w-4" />} /></Button>
  </form>;
}

export function LayawayLifecycleActions({ orderId, canRelease, hasPayments }: { orderId: string; canRelease: boolean; hasPayments: boolean }) {
  const router = useRouter();
  const [handoverState, handoverAction, handoverPending] = useActionState(handoverLayaway, initial);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelLayaway, initial);
  useEffect(() => { if (handoverState.ok || cancelState.ok) router.refresh(); }, [handoverState.ok, cancelState.ok, router]);
  return <div className="space-y-4">
    {canRelease && <form action={handoverAction} className="space-y-2"><input type="hidden" name="orderId" value={orderId}/><Button className="w-full" size="lg" disabled={handoverPending}><ActionButtonContent pending={handoverPending} success={handoverState.ok} idleLabel="Hand over goods & create final invoice" pendingLabel="Completing handover…" successLabel="Handover completed" idleIcon={<Handshake className="h-4 w-4" />} /></Button><ActionFeedback error={handoverState.error} success={handoverState.ok ? "Goods handed over and final invoice created." : undefined} /></form>}
    <details className="rounded-xl border border-danger/20 bg-danger-soft/25 p-3">
      <summary className="cursor-pointer text-sm font-bold text-danger-ink">Cancel layaway</summary>
      <form action={cancelAction} className="mt-3 space-y-2"><input type="hidden" name="orderId" value={orderId}/>{hasPayments && <p className="text-xs font-medium text-danger-ink">Payments are preserved. Any refund must be handled and recorded manually; cancellation does not delete receipts.</p>}<Label>Required reason</Label><Input name="reason" minLength={5} required placeholder="Why is this order being cancelled?"/><Button variant="danger" size="sm" disabled={cancelPending}><ActionButtonContent pending={cancelPending} success={cancelState.ok} idleLabel="Cancel & release reservation" pendingLabel="Cancelling…" successLabel="Layaway cancelled" idleIcon={<Ban className="h-4 w-4" />} /></Button><ActionFeedback error={cancelState.error} success={cancelState.ok ? "Layaway cancelled and reservation released." : undefined} /></form>
    </details>
  </div>;
}
