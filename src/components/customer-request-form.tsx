"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerRequestFormState } from "@/app/(app)/requests/actions";
import { REQUEST_PRIORITY_OPTIONS, REQUEST_TYPE_OPTIONS } from "@/lib/customer-requests";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CustomerRequestInitial = {
  title: string;
  type: "PRODUCT_INQUIRY" | "IMPORT_REQUEST" | "PRICE_INQUIRY" | "OTHER";
  description: string;
  quantity: number;
  budget: string;
  priority: "LOW" | "NORMAL" | "HIGH";
  customerId: string;
  contactName: string;
  contactPhone: string;
  productId: string;
  supplierId: string;
  assignedToUserId: string;
  followUpDate: string;
  expectedArrivalDate: string;
  remindBySms: boolean;
};

const empty: CustomerRequestInitial = {
  title: "",
  type: "PRODUCT_INQUIRY",
  description: "",
  quantity: 1,
  budget: "",
  priority: "NORMAL",
  customerId: "",
  contactName: "",
  contactPhone: "",
  productId: "",
  supplierId: "",
  assignedToUserId: "",
  followUpDate: "",
  expectedArrivalDate: "",
  remindBySms: false,
};

type Option = { id: string; name: string };

export function CustomerRequestForm({
  action,
  customers,
  products,
  suppliers,
  users,
  initial,
  defaultAssigneeId,
  submitLabel = "Save request",
}: {
  action: (previous: CustomerRequestFormState, formData: FormData) => Promise<CustomerRequestFormState>;
  customers: { id: string; name: string; phone: string }[];
  products: (Option & { code: string })[];
  suppliers: Option[];
  users: Option[];
  initial?: CustomerRequestInitial;
  defaultAssigneeId: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const values = initial ?? { ...empty, assignedToUserId: defaultAssigneeId };
  const [state, formAction, pending] = useActionState(action, {});
  const [customerId, setCustomerId] = useState(values.customerId);
  const [followUpDate, setFollowUpDate] = useState(values.followUpDate);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-5">
          {state.error && (
            <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="title">Requested product / subject</Label>
              <Input id="title" name="title" defaultValue={values.title} placeholder="e.g. Samsung 65-inch TV" required autoFocus />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" name="quantity" type="number" min="1" defaultValue={values.quantity} required />
            </div>
            <div>
              <Label htmlFor="type">Request type</Label>
              <Select id="type" name="type" defaultValue={values.type}>
                {REQUEST_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" name="priority" defaultValue={values.priority}>
                {REQUEST_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="budget">Customer budget (optional)</Label>
              <Input id="budget" name="budget" type="number" min="0" step="0.01" defaultValue={values.budget} placeholder="LKR" />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Details / notes</Label>
            <Textarea id="description" name="description" defaultValue={values.description} placeholder="Brand, model, colour, size, source country, or anything promised to the customer" />
          </div>

          <div>
            <Label htmlFor="customerId">Customer</Label>
            <Select id="customerId" name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Walk-in / no customer account</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.phone}</option>)}
            </Select>
            <Link href="/customers/new" className="mt-1 inline-block text-xs text-primary hover:underline">+ Add a customer record</Link>
          </div>

          {!customerId && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="contactName">Walk-in name</Label>
                <Input id="contactName" name="contactName" defaultValue={values.contactName} />
              </div>
              <div>
                <Label htmlFor="contactPhone">Walk-in phone</Label>
                <Input id="contactPhone" name="contactPhone" defaultValue={values.contactPhone} placeholder="e.g. 0771234567" inputMode="tel" />
              </div>
              <p className="text-xs text-muted sm:col-span-2">Enter at least a name or phone number so the request can be identified later.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="productId">Related stock product (optional)</Label>
              <Select id="productId" name="productId" defaultValue={values.productId}>
                <option value="">Not an existing product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="supplierId">Possible supplier (optional)</Label>
              <Select id="supplierId" name="supplierId" defaultValue={values.supplierId}>
                <option value="">Not decided</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="assignedToUserId">Assigned to</Label>
              <Select id="assignedToUserId" name="assignedToUserId" defaultValue={values.assignedToUserId || defaultAssigneeId} required>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="followUpDate">Remind me on</Label>
              <Input id="followUpDate" name="followUpDate" type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="expectedArrivalDate">Expected arrival</Label>
              <Input id="expectedArrivalDate" name="expectedArrivalDate" type="date" defaultValue={values.expectedArrivalDate} />
            </div>
          </div>

          <label className={`flex items-start gap-2 rounded-lg border border-border p-3 text-sm ${followUpDate ? "" : "opacity-50"}`}>
            <input type="checkbox" name="remindBySms" defaultChecked={values.remindBySms} disabled={!followUpDate} className="mt-0.5 h-4 w-4 rounded border-border" />
            <span>
              <span className="block font-medium">Send an SMS reminder to the shop</span>
              <span className="block text-xs text-muted">Uses the admin phone and SMS settings already configured in Settings.</span>
            </span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
