"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerFormState } from "@/app/(app)/customers/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NicUpload } from "@/components/nic-upload";

export type CustomerInitial = {
  name: string;
  phone: string;
  nic: string;
  address: string;
  email: string;
  nicFrontKey: string;
  nicBackKey: string;
};

const empty: CustomerInitial = {
  name: "",
  phone: "",
  nic: "",
  address: "",
  email: "",
  nicFrontKey: "",
  nicBackKey: "",
};

export function CustomerForm({
  action,
  initial = empty,
  submitLabel = "Save Customer",
}: {
  action: (prev: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  initial?: CustomerInitial;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-5">
          {state.error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</div>
          )}
          {state.duplicate && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <input type="checkbox" name="confirmDuplicate" className="mt-0.5 h-4 w-4 rounded border-border" />
              <span>Save anyway — this phone number is already used by another customer.</span>
            </label>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" defaultValue={initial.name} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={initial.phone} placeholder="e.g. 0771234567" required />
            </div>
            <div>
              <Label htmlFor="nic">NIC number</Label>
              <Input id="nic" name="nic" defaultValue={initial.nic} />
            </div>
            <div>
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" name="email" type="email" defaultValue={initial.email} />
            </div>
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={initial.address} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NicUpload name="nicFrontKey" label="NIC — Front" defaultKey={initial.nicFrontKey} />
            <NicUpload name="nicBackKey" label="NIC — Back" defaultKey={initial.nicBackKey} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
