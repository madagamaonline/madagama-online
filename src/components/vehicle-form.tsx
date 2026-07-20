"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Tractor, BadgeDollarSign, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VehicleCombobox } from "@/components/vehicle-combobox";
import { Textarea } from "@/components/ui/textarea";
import { ServicePhotos } from "@/components/service-photos";

export type VehicleFormState = { error?: string; ok?: boolean };
export type VehicleFormInitial = {
  type: "TRACTOR" | "HARVESTER" | "COMBINE_HARVESTER";
  make: string;
  model: string;
  year: string;
  colour: string;
  engineNumber: string;
  chassisNumber: string;
  supplierId: string;
  supplierReference: string;
  receivedDate: string;
  listPrice: number;
  supplierPayable: number;
  specifications: string;
  notes: string;
  photoKeys: string[];
};

const empty: VehicleFormInitial = {
  type: "TRACTOR",
  make: "",
  model: "",
  year: "",
  colour: "",
  engineNumber: "",
  chassisNumber: "",
  supplierId: "",
  supplierReference: "",
  receivedDate: new Date().toISOString().slice(0, 10),
  listPrice: 0,
  supplierPayable: 0,
  specifications: "",
  notes: "",
  photoKeys: [],
};

export function VehicleForm({
  action,
  suppliers,
  initial = empty,
  submitLabel = "Receive vehicle",
}: {
  action: (previous: VehicleFormState, data: FormData) => Promise<VehicleFormState>;
  suppliers: { id: string; name: string; phone?: string | null }[];
  initial?: VehicleFormInitial;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [supplierId, setSupplierId] = useState(initial.supplierId);

  return (
    <form action={formAction} className="space-y-4">
      <div aria-live="polite">
        {state.error ? <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">{state.error}</div> : null}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Tractor className="h-4 w-4 text-muted" />Identity</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><Label htmlFor="kind">Vehicle type</Label><Select id="kind" name="kind" defaultValue={initial.type} required><option value="TRACTOR">Tractor</option><option value="HARVESTER">Harvester</option><option value="COMBINE_HARVESTER">Combine harvester</option></Select></div>
          <div><Label htmlFor="make">Make</Label><Input id="make" name="make" defaultValue={initial.make} placeholder="e.g. Kubota" required /></div>
          <div><Label htmlFor="model">Model</Label><Input id="model" name="model" defaultValue={initial.model} placeholder="e.g. MU5502" required /></div>
          <div><Label htmlFor="engineNumber">Engine number</Label><Input id="engineNumber" name="engineNumber" defaultValue={initial.engineNumber} className="font-mono uppercase" autoCapitalize="characters" required /></div>
          <div><Label htmlFor="chassisNumber">Chassis number</Label><Input id="chassisNumber" name="chassisNumber" defaultValue={initial.chassisNumber} className="font-mono uppercase" autoCapitalize="characters" required /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="year">Year</Label><Input id="year" name="year" type="number" min="1950" max="2100" defaultValue={initial.year} /></div><div><Label htmlFor="colour">Colour</Label><Input id="colour" name="colour" defaultValue={initial.colour} /></div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4 text-muted" />Supplier &amp; commercial terms</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><VehicleCombobox id="supplierId-combobox" label="Supplier" options={suppliers.map((s) => ({ value: s.id, label: s.name, hint: s.phone ?? undefined }))} value={supplierId} onChange={setSupplierId} placeholder="Select supplier…" /><input type="hidden" name="supplierId" value={supplierId} required /></div>
            <div><Label htmlFor="supplierReference">Supplier reference</Label><Input id="supplierReference" name="supplierReference" defaultValue={initial.supplierReference} className="font-mono" /></div>
            <div><Label htmlFor="receivedAt">Received date</Label><Input id="receivedAt" name="receivedAt" type="date" defaultValue={initial.receivedDate} required /></div>
          </div>
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border-subtle bg-input/50 p-4 sm:grid-cols-2">
            <div><Label htmlFor="listPrice">List price (LKR)</Label><NumberInput id="listPrice" name="listPrice" min={0} defaultValue={initial.listPrice || undefined} required /></div>
            <div><Label htmlFor="supplierSettlementDue">Amount payable to supplier (LKR)</Label><NumberInput id="supplierSettlementDue" name="supplierSettlementDue" min={0} defaultValue={initial.supplierPayable || undefined} required /></div>
            <p className="sm:col-span-2 text-xs text-muted">No supplier payable is created at intake. These terms are snapshotted only when the vehicle is sold.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-muted" />Details</CardTitle></CardHeader>
        <CardContent className="space-y-4"><div><Label htmlFor="specifications">Specifications &amp; condition</Label><Textarea id="specifications" name="specifications" defaultValue={initial.specifications} rows={4} placeholder="Horsepower, drive type, accessories, operating hours, tyre condition…" /></div><div><Label htmlFor="notes">Internal notes</Label><Textarea id="notes" name="notes" defaultValue={initial.notes} rows={3} placeholder="Visible damage or special supplier instructions…" /></div><ServicePhotos name="photoKeys" defaultKeys={initial.photoKeys} /></CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
