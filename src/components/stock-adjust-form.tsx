"use client";

import { useActionState } from "react";
import { adjustStock, type AdjustStockState } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { InventoryTracking, UnitOfMeasure } from "@prisma/client";
import { UNIT_LABELS, unitsForTracking } from "@/lib/units";

const initial: AdjustStockState = {};

export function StockAdjustForm({ productId, trackingType, defaultUnit }: { productId: string; trackingType: InventoryTracking; defaultUnit: UnitOfMeasure }) {
  const [state, action, pending] = useActionState(adjustStock.bind(null, productId), initial);

  return (
    <form action={action} className="space-y-3">
      {state.error && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>
      )}
      {state.ok && (
        <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Stock adjusted.</div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="direction">Direction</Label>
          <Select id="direction" name="direction" defaultValue="in">
            <option value="in">Add (+)</option>
            <option value="out">Remove (−)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="qty">Quantity</Label>
          <Input id="qty" name="qty" type="number" min={trackingType === "PIECE" ? "1" : "0.0001"} step={trackingType === "PIECE" ? "1" : "0.0001"} required />
        </div>
        <div>
          <Label htmlFor="unit">Unit</Label>
          <Select id="unit" name="unit" defaultValue={defaultUnit}>
            {unitsForTracking(trackingType).map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}
          </Select>
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
