"use client";

import { useActionState } from "react";
import { adjustStock, type AdjustStockState } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initial: AdjustStockState = {};

export function StockAdjustForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(adjustStock.bind(null, productId), initial);

  return (
    <form action={action} className="space-y-3">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</div>
      )}
      {state.ok && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Stock adjusted.</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="direction">Direction</Label>
          <Select id="direction" name="direction" defaultValue="in">
            <option value="in">Add (+)</option>
            <option value="out">Remove (−)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="qty">Quantity</Label>
          <Input id="qty" name="qty" type="number" min="1" step="1" required />
        </div>
      </div>
      <div>
        <Label htmlFor="reason">Reason</Label>
        <Input id="reason" name="reason" placeholder="e.g. Damaged, stock-take, theft" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Apply adjustment"}
      </Button>
    </form>
  );
}
