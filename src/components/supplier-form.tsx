"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { SupplierFormState } from "@/app/(app)/suppliers/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SupplierInitial = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};

const empty: SupplierInitial = { name: "", contactPerson: "", phone: "", email: "", address: "" };

export function SupplierForm({
  action,
  initial = empty,
  submitLabel = "Save Supplier",
}: {
  action: (prev: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;
  initial?: SupplierInitial;
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Supplier name</Label>
              <Input id="name" name="name" defaultValue={initial.name} required />
            </div>
            <div>
              <Label htmlFor="contactPerson">Contact person</Label>
              <Input id="contactPerson" name="contactPerson" defaultValue={initial.contactPerson} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={initial.phone} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={initial.email} />
            </div>
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={initial.address} />
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
