"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createOvertime, type OvertimeState } from "@/app/(app)/overtime/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatLKR } from "@/lib/utils";

const initial: OvertimeState = {};

export function AddOvertime({ employees }: { employees: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createOvertime, initial);
  const ref = useRef<HTMLFormElement>(null);
  const [hours, setHours] = useState(0);
  const [rate, setRate] = useState(0);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      // Defer the state reset out of the effect body (project lint forbids
      // synchronous setState in an effect — matches the existing pattern).
      setTimeout(() => {
        setHours(0);
        setRate(0);
      }, 0);
    }
  }, [state]);

  const amount = hours > 0 && rate > 0 ? hours * rate : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Overtime</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="space-y-3">
          {state.error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>}
          {state.ok && <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Overtime added.</div>}
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
              <Label htmlFor="hours">Hours</Label>
              <NumberInput id="hours" name="hours" required onValueChange={(v) => setHours(Number(v) || 0)} />
            </div>
            <div>
              <Label htmlFor="rate">Hourly rate (LKR)</Label>
              <NumberInput id="rate" name="rate" required onValueChange={(v) => setRate(Number(v) || 0)} />
            </div>
          </div>
          <div className="rounded-lg bg-bg px-3 py-2 text-sm">
            Overtime pay: <span className="tabular font-medium">{formatLKR(amount)}</span>
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={today} />
          </div>
          <div>
            <Label htmlFor="reason">Note (optional)</Label>
            <Input id="reason" name="reason" placeholder="e.g. Stocktake till 9pm" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            <Plus className="h-4 w-4" /> {pending ? "Adding…" : "Add Overtime"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
