"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { CustomerRequestStatus } from "@prisma/client";
import type { CustomerRequestStatusState } from "@/app/(app)/requests/actions";
import { REQUEST_STATUS_OPTIONS } from "@/lib/customer-requests";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function CustomerRequestStatusForm({
  action,
  currentStatus,
}: {
  action: (previous: CustomerRequestStatusState, formData: FormData) => Promise<CustomerRequestStatusState>;
  currentStatus: CustomerRequestStatus;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3" aria-busy={pending}>
      {state.error && <p role="alert" className="motion-panel-in rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>}
      {state.success && <p role="status" className="motion-panel-in flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-ink"><CheckCircle2 className="motion-check-in h-4 w-4" />Request updated.</p>}
      <div>
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={currentStatus}>
          {REQUEST_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="note">Update note (optional)</Label>
        <Textarea id="note" name="note" placeholder="e.g. Supplier confirmed availability" />
      </div>
      <Button type="submit" disabled={pending} className="w-full" aria-live="polite">{pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "Updating…" : "Update request"}</Button>
    </form>
  );
}
