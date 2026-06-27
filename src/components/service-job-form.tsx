"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServiceJobFormState } from "@/app/(app)/services/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ServicePhotos } from "@/components/service-photos";

export type ServiceJobInitial = {
  itemName: string;
  brand: string;
  serialNumber: string;
  underWarranty: boolean;
  issue: string;
  resolution: string;
  notes: string;
  customerId: string;
  contactName: string;
  contactPhone: string;
  photoKeys: string[];
};

const empty: ServiceJobInitial = {
  itemName: "",
  brand: "",
  serialNumber: "",
  underWarranty: false,
  issue: "",
  resolution: "",
  notes: "",
  customerId: "",
  contactName: "",
  contactPhone: "",
  photoKeys: [],
};

export function ServiceJobForm({
  action,
  customers,
  initial = empty,
  submitLabel = "Save service job",
}: {
  action: (prev: ServiceJobFormState, formData: FormData) => Promise<ServiceJobFormState>;
  customers: { id: string; name: string; phone: string }[];
  initial?: ServiceJobInitial;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [customerId, setCustomerId] = useState(initial.customerId);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-5">
          {state.error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>
          )}

          {/* Item */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <Label htmlFor="itemName">Item</Label>
              <Input
                id="itemName"
                name="itemName"
                defaultValue={initial.itemName}
                placeholder="e.g. Refrigerator"
                required
              />
            </div>
            <div>
              <Label htmlFor="brand">Brand / model</Label>
              <Input id="brand" name="brand" defaultValue={initial.brand} placeholder="e.g. LG GL-T" />
            </div>
            <div>
              <Label htmlFor="serialNumber">Serial number</Label>
              <Input id="serialNumber" name="serialNumber" defaultValue={initial.serialNumber} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="underWarranty"
              defaultChecked={initial.underWarranty}
              className="h-4 w-4 rounded border-border"
            />
            <span>Under warranty (warranty repair, not a paid job)</span>
          </label>

          <div>
            <Label htmlFor="issue">Problem / requested work</Label>
            <Textarea
              id="issue"
              name="issue"
              defaultValue={initial.issue}
              placeholder="What is wrong / what service is needed?"
              required
            />
          </div>

          {/* Customer */}
          <div>
            <Label htmlFor="customerId">Customer</Label>
            <Select
              id="customerId"
              name="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in (no account)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </Select>
            <Link href="/customers/new" className="mt-1 inline-block text-xs text-primary hover:underline">
              + Add a customer record
            </Link>
          </div>

          {!customerId && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="contactName">Walk-in name</Label>
                <Input id="contactName" name="contactName" defaultValue={initial.contactName} />
              </div>
              <div>
                <Label htmlFor="contactPhone">Walk-in phone</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  defaultValue={initial.contactPhone}
                  placeholder="e.g. 0771234567"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="resolution">Work done / resolution (optional)</Label>
            <Textarea
              id="resolution"
              name="resolution"
              defaultValue={initial.resolution}
              placeholder="Fill in once the service is done"
            />
          </div>

          <div>
            <Label htmlFor="notes">Internal notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={initial.notes}
              placeholder="e.g. charged Rs. 3,500, gas refill, parts ordered"
            />
          </div>

          <ServicePhotos name="photoKeys" defaultKeys={initial.photoKeys} />

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
