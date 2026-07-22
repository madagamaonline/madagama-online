"use client";

import { useActionState } from "react";
import type { LolcActionState } from "@/app/(app)/lolc-receipt/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = (previous: LolcActionState, formData: FormData) => Promise<LolcActionState>;

function nowInSriLanka(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function ActionMessage({ state }: { state: LolcActionState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>;
  if (state.success) return <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success-ink">Update saved.</p>;
  return null;
}

function useReceiptAction(action: Action, key: string) {
  const [state, formAction, pending] = useActionState(action, {});
  return { state, formAction, pending, key };
}

export function MarkMcashSentForm({ action, idempotencyKey }: { action: Action; idempotencyKey: string }) {
  const { state, formAction, pending, key } = useReceiptAction(action, idempotencyKey);
  return <form action={formAction} className="space-y-3">
    <input type="hidden" name="idempotencyKey" value={key} />
    <ActionMessage state={state} />
    <div><Label htmlFor="mcash-reference">mCash transaction reference</Label><Input id="mcash-reference" name="reference" maxLength={120} required /></div>
    <div><Label htmlFor="mcash-time">Sent date and time</Label><Input id="mcash-time" name="occurredAt" type="datetime-local" defaultValue={nowInSriLanka()} required /></div>
    <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Mark mCash sent"}</Button>
  </form>;
}

export function ReportIssueForm({ action, idempotencyKey }: { action: Action; idempotencyKey: string }) {
  const { state, formAction, pending, key } = useReceiptAction(action, idempotencyKey);
  return <form action={formAction} className="space-y-3">
    <input type="hidden" name="idempotencyKey" value={key} />
    <ActionMessage state={state} />
    <div><Label htmlFor="issue-note">What needs attention?</Label><Textarea id="issue-note" name="note" maxLength={1000} placeholder="e.g. Agreement not credited after 24 hours" required /></div>
    <Button type="submit" disabled={pending} variant="outline" className="w-full">{pending ? "Saving…" : "Report an issue"}</Button>
  </form>;
}

export function ConfirmLolcForm({ action, idempotencyKey }: { action: Action; idempotencyKey: string }) {
  const { state, formAction, pending, key } = useReceiptAction(action, idempotencyKey);
  return <form action={formAction} className="space-y-3">
    <input type="hidden" name="idempotencyKey" value={key} />
    <ActionMessage state={state} />
    <div><Label htmlFor="confirmation-reference">LOLC reference (optional)</Label><Input id="confirmation-reference" name="reference" maxLength={120} /></div>
    <div><Label htmlFor="confirmation-time">Confirmed date and time</Label><Input id="confirmation-time" name="occurredAt" type="datetime-local" defaultValue={nowInSriLanka()} required /></div>
    <div><Label htmlFor="confirmation-note">Verification note</Label><Textarea id="confirmation-note" name="note" maxLength={1000} placeholder="Required when there is no LOLC reference" /></div>
    <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Confirm LOLC applied payment"}</Button>
  </form>;
}

export function VoidLolcForm({ action, confirmed, idempotencyKey }: { action: Action; confirmed: boolean; idempotencyKey: string }) {
  const { state, formAction, pending, key } = useReceiptAction(action, idempotencyKey);
  return <form action={formAction} className="space-y-3">
    <input type="hidden" name="idempotencyKey" value={key} />
    <ActionMessage state={state} />
    {confirmed && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger-ink">Warning: this receipt is already confirmed. Voiding preserves its full audit history and marks every reprint VOID.</p>}
    <div><Label htmlFor="void-reason">Void reason</Label><Textarea id="void-reason" name="reason" maxLength={1000} placeholder="Explain why this issued receipt is invalid" required /></div>
    <Button type="submit" disabled={pending} variant="danger" className="w-full">{pending ? "Voiding…" : "Void receipt"}</Button>
  </form>;
}
