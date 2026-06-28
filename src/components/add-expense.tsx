"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createExpense, type ExpenseState } from "@/app/(app)/expenses/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initial: ExpenseState = {};
const CATEGORIES = ["Rent", "Utilities", "Bills", "Transport", "Supplies", "Maintenance", "Misc"];

export function AddExpense() {
  const [state, action, pending] = useActionState(createExpense, initial);
  const ref = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Expense</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="space-y-3">
          {state.error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>}
          {state.ok && <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Expense added.</div>}
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" required>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
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
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" name="description" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            <Plus className="h-4 w-4" /> {pending ? "Adding…" : "Add Expense"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
