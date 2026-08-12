"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, OctagonX } from "lucide-react";
import { clearCheque, voidCheque, type BankingActionState } from "@/app/(app)/banking/actions";
import { voidKindLabel, VOID_KINDS } from "@/lib/cheques";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatLKR } from "@/lib/utils";

const initial: BankingActionState = {};

export function ChequeLifecyclePanel({ chequeId, remaining }: { chequeId: string; remaining: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "clear" | "void">("idle");
  const [clearState, clearAction, clearing] = useActionState(clearCheque.bind(null, chequeId), initial);
  const [voidState, voidAction, voiding] = useActionState(voidCheque.bind(null, chequeId), initial);
  const today = new Date().toISOString().slice(0, 10);

  // On success the server re-renders this card into its cleared/voided form, so the
  // panel unmounts — only the refresh is needed here (project lint forbids setState
  // synchronously in an effect body).
  useEffect(() => {
    if (clearState.ok || voidState.ok) router.refresh();
  }, [clearState.ok, voidState.ok, router]);

  if (mode === "idle") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-clay-soft p-3">
          <p className="text-xs text-clay-ink">Outstanding on this cheque</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-clay-ink">{formatLKR(remaining)}</p>
        </div>
        <Button className="w-full" onClick={() => setMode("clear")}>
          <CheckCircle2 className="h-4 w-4" /> Mark as cleared
        </Button>
        <Button variant="outline" className="w-full text-danger" onClick={() => setMode("void")}>
          <OctagonX className="h-4 w-4" /> Stop / bounce this cheque
        </Button>
      </div>
    );
  }

  if (mode === "clear") {
    return (
      <form action={clearAction} className="space-y-3">
        {clearState.error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{clearState.error}</p>
        )}
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary-ink">
          The bank debited the full {formatLKR(remaining)}. A cheque clears in full or not at all.
        </p>
        <div>
          <Label htmlFor="cheque-cleared-date">Date cleared</Label>
          <Input id="cheque-cleared-date" name="clearedDate" type="date" defaultValue={today} required />
        </div>
        <div>
          <Label htmlFor="cheque-cleared-note">Note (optional)</Label>
          <Input id="cheque-cleared-note" name="note" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setMode("idle")} disabled={clearing}>
            Cancel
          </Button>
          <Button className="flex-1" type="submit" disabled={clearing}>
            {clearing && <Loader2 className="h-4 w-4 animate-spin" />}
            {clearing ? "Saving…" : "Confirm cleared"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={voidAction} className="space-y-3">
      {voidState.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{voidState.error}</p>
      )}
      <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">
        This cancels the cheque, not the debt. {formatLKR(remaining)} goes straight back onto the supplier&apos;s
        balance so you can reissue a cheque or pay cash. The cheque record is kept for the bank and the auditor.
      </p>
      <div>
        <Label htmlFor="cheque-void-kind">What happened?</Label>
        <Select id="cheque-void-kind" name="kind" defaultValue="STOPPED" required>
          {VOID_KINDS.map((kind) => (
            <option key={kind} value={kind}>{voidKindLabel[kind]}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="cheque-void-date">Date</Label>
        <Input id="cheque-void-date" name="voidedDate" type="date" defaultValue={today} required />
      </div>
      <div>
        <Label htmlFor="cheque-void-reason">Reason</Label>
        <Textarea id="cheque-void-reason" name="reason" rows={3} required placeholder="e.g. goods not delivered, funds short on due date, dispute over invoice…" />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => setMode("idle")} disabled={voiding}>
          Cancel
        </Button>
        <Button className="flex-1 bg-danger text-white hover:bg-danger" type="submit" disabled={voiding}>
          {voiding && <Loader2 className="h-4 w-4 animate-spin" />}
          {voiding ? "Stopping…" : "Confirm"}
        </Button>
      </div>
    </form>
  );
}
