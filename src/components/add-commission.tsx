"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createCommission, type CommissionState } from "@/app/(app)/commissions/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initial: CommissionState = {};

export function AddCommission({ employees }: { employees: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createCommission, initial);
  const ref = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Commission</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="space-y-3">
          {state.error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>}
          {state.ok && <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Commission added.</div>}
          <div>
            <Label htmlFor="employeeId">Employee</Label>
            <Select id="employeeId" name="employeeId" required>
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amount">Amount (LKR)</Label>
              <NumberInput id="amount" name="amount" required />
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={today} />
            </div>
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" name="reason" placeholder="e.g. Sold a tractor" required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            <Plus className="h-4 w-4" /> {pending ? "Adding…" : "Add Commission"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
