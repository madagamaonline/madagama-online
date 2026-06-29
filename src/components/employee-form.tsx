"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeFormState } from "@/app/(app)/employees/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const EMPLOYEE_POSITIONS = ["Sales Rep", "Driver", "Helper", "Other"] as const;

export type EmployeeInitial = {
  name: string;
  nic: string;
  phone: string;
  address: string;
  position: string;
  dailyRate: number;
  epfEtfMember: boolean;
  epfNumber: string;
};

const empty: EmployeeInitial = {
  name: "",
  nic: "",
  phone: "",
  address: "",
  position: "",
  dailyRate: 0,
  epfEtfMember: false,
  epfNumber: "",
};

export function EmployeeForm({
  action,
  initial = empty,
  submitLabel = "Save Employee",
}: {
  action: (prev: EmployeeFormState, formData: FormData) => Promise<EmployeeFormState>;
  initial?: EmployeeInitial;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-5">
          {state.error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" defaultValue={initial.name} required />
            </div>
            <div>
              <Label htmlFor="dailyRate">Daily rate (LKR)</Label>
              <NumberInput id="dailyRate" name="dailyRate" defaultValue={initial.dailyRate} required />
            </div>
            <div>
              <Label htmlFor="position">Position / role</Label>
              <Select id="position" name="position" defaultValue={initial.position}>
                <option value="">—</option>
                {EMPLOYEE_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={initial.phone} />
            </div>
            <div>
              <Label htmlFor="nic">NIC</Label>
              <Input id="nic" name="nic" defaultValue={initial.nic} />
            </div>
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={initial.address} />
          </div>
          <div className="rounded-lg border border-border bg-input/40 p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="epfEtfMember"
                defaultChecked={initial.epfEtfMember}
                className="h-4 w-4 rounded border-border"
              />
              EPF / ETF member
            </label>
            <p className="text-xs text-muted">
              Tick for permanent staff registered for EPF/ETF. Members have 8% EPF deducted from pay
              (on basic wages); the shop also contributes 12% EPF + 3% ETF. Leave unticked for casual
              / daily helpers.
            </p>
            <div className="max-w-xs">
              <Label htmlFor="epfNumber">EPF number (optional)</Label>
              <Input id="epfNumber" name="epfNumber" defaultValue={initial.epfNumber} placeholder="e.g. SL/12345" />
            </div>
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
