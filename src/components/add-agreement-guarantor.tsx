"use client";

import { useActionState } from "react";
import { addAgreementGuarantor, type GuarantorFormState } from "@/app/(app)/credit/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NicUpload } from "@/components/nic-upload";

export function AddAgreementGuarantor({ agreementId }: { agreementId: string }) {
  const action = addAgreementGuarantor.bind(null, agreementId);
  const [state, formAction, pending] = useActionState(action, {} as GuarantorFormState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay-ink">
        Guarantor details are pending. Add them when the goods are delivered.
      </div>
      {state.error && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>
      )}
      {state.duplicate && (
        <label className="flex items-start gap-2 rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink">
          <input type="checkbox" name="confirmDuplicate" className="mt-0.5 h-4 w-4 rounded border-border" />
          <span>Continue anyway — the guarantor&apos;s phone matches the customer&apos;s.</span>
        </label>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="guarantor-name">Name</Label>
          <Input id="guarantor-name" name="name" required />
        </div>
        <div>
          <Label htmlFor="guarantor-nic">NIC number</Label>
          <Input id="guarantor-nic" name="nic" required />
        </div>
        <div>
          <Label htmlFor="guarantor-phone">Phone</Label>
          <Input id="guarantor-phone" name="phone" inputMode="tel" required />
        </div>
        <div>
          <Label htmlFor="guarantor-address">Address (optional)</Label>
          <Input id="guarantor-address" name="address" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NicUpload name="nicFrontKey" label="Guarantor NIC — Front" />
        <NicUpload name="nicBackKey" label="Guarantor NIC — Back" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Guarantor"}
      </Button>
    </form>
  );
}
