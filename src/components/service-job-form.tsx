"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceJobFormState } from "@/app/(app)/services/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CustomerSearchPicker,
  type SaleCustomer,
} from "@/components/customer-search-picker";
import { ServicePhotos } from "@/components/service-photos";
import { QuickCustomerModal } from "@/components/quick-customer-modal";

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
  customers: SaleCustomer[];
  initial?: ServiceJobInitial;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState(() => initial);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [addedCustomers, setAddedCustomers] = useState<typeof customers>([]);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const localCustomers = useMemo(
    () => [...addedCustomers, ...customers],
    [addedCustomers, customers],
  );

  function handleQuickCustomerSuccess(newCust: { id: string; name: string; phone: string }) {
    setAddedCustomers((prev) => [{ ...newCust, nic: null }, ...prev]);
    setCustomerId(newCust.id);
  }

  return (
    <Fragment>
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
                value={values.itemName}
                onChange={(event) => setValues((current) => ({ ...current, itemName: event.target.value }))}
                placeholder="e.g. Refrigerator"
                required
              />
            </div>
            <div>
              <Label htmlFor="brand">Brand / model</Label>
              <Input id="brand" name="brand" value={values.brand} onChange={(event) => setValues((current) => ({ ...current, brand: event.target.value }))} placeholder="e.g. LG GL-T" />
            </div>
            <div>
              <Label htmlFor="serialNumber">Serial number</Label>
              <Input id="serialNumber" name="serialNumber" value={values.serialNumber} onChange={(event) => setValues((current) => ({ ...current, serialNumber: event.target.value }))} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="underWarranty"
              checked={values.underWarranty}
              onChange={(event) => setValues((current) => ({ ...current, underWarranty: event.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            <span>Under warranty (warranty repair, not a paid job)</span>
          </label>

          <div>
            <Label htmlFor="issue">Problem / requested work</Label>
            <Textarea
              id="issue"
              name="issue"
              value={values.issue}
              onChange={(event) => setValues((current) => ({ ...current, issue: event.target.value }))}
              placeholder="What is wrong / what service is needed?"
              required
            />
          </div>

          {/* Customer */}
          <div>
            <Label htmlFor="service-job-customer">Customer</Label>
            <input type="hidden" name="customerId" value={customerId} />
            <CustomerSearchPicker
              recentCustomers={localCustomers}
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              inputId="service-job-customer"
            />
            <button
              type="button"
              onClick={() => setShowQuickCustomer(true)}
              className="mt-1 inline-block text-xs text-primary hover:underline"
            >
              + Quick add customer
            </button>
          </div>

          {!customerId && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="contactName">Walk-in name</Label>
                <Input id="contactName" name="contactName" value={values.contactName} onChange={(event) => setValues((current) => ({ ...current, contactName: event.target.value }))} />
              </div>
              <div>
                <Label htmlFor="contactPhone">Walk-in phone</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  value={values.contactPhone}
                  onChange={(event) => setValues((current) => ({ ...current, contactPhone: event.target.value }))}
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
              value={values.resolution}
              onChange={(event) => setValues((current) => ({ ...current, resolution: event.target.value }))}
              placeholder="Fill in once the service is done"
            />
          </div>

          <div>
            <Label htmlFor="notes">Internal notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              value={values.notes}
              onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
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

      {showQuickCustomer && (
        <QuickCustomerModal
          onClose={() => setShowQuickCustomer(false)}
          onSuccess={handleQuickCustomerSuccess}
        />
      )}
    </Fragment>
  );
}
