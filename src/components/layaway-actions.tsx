"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Handshake, Loader2, Printer } from "lucide-react";
import { cancelLayaway, handoverLayaway, recordLayawayPayment, type LayawayActionState } from "@/app/(app)/layaways/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatLKR } from "@/lib/utils";

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
    {state.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>}
    {state.ok && <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-primary-ink"><Printer className="h-4 w-4"/>Payment saved. Receipt opened for printing.</p>}
    <Button className="w-full" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Banknote className="h-4 w-4"/>}Record installment & receipt</Button>
  </form>;
}

export function LayawayLifecycleActions({ orderId, canRelease, hasPayments }: { orderId: string; canRelease: boolean; hasPayments: boolean }) {
  const router = useRouter();
  const [handoverState, handoverAction, handoverPending] = useActionState(handoverLayaway, initial);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelLayaway, initial);
  useEffect(() => { if (handoverState.ok || cancelState.ok) router.refresh(); }, [handoverState.ok, cancelState.ok, router]);
  return <div className="space-y-4">
    {canRelease && <form action={handoverAction}><input type="hidden" name="orderId" value={orderId}/><Button className="w-full" size="lg" disabled={handoverPending}>{handoverPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Handshake className="h-4 w-4"/>}Hand over goods & create final invoice</Button>{handoverState.error && <p role="alert" className="mt-2 text-sm text-danger">{handoverState.error}</p>}</form>}
    <details className="rounded-xl border border-danger/20 bg-danger-soft/25 p-3">
      <summary className="cursor-pointer text-sm font-bold text-danger-ink">Cancel layaway</summary>
      <form action={cancelAction} className="mt-3 space-y-2"><input type="hidden" name="orderId" value={orderId}/>{hasPayments && <p className="text-xs font-medium text-danger-ink">Payments are preserved. Any refund must be handled and recorded manually; cancellation does not delete receipts.</p>}<Label>Required reason</Label><Input name="reason" minLength={5} required placeholder="Why is this order being cancelled?"/><Button variant="danger" size="sm" disabled={cancelPending}>{cancelPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Ban className="h-4 w-4"/>}Cancel & release reservation</Button>{cancelState.error && <p role="alert" className="text-sm text-danger">{cancelState.error}</p>}</form>
    </details>
  </div>;
}
