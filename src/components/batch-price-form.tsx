"use client";

import { useActionState } from "react";
import { updateBatchSellingPrice, type BatchPriceState } from "@/app/(app)/products/actions";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";

const initial: BatchPriceState = {};

/** Inline editor for one stock batch's selling price. */
export function BatchPriceForm({ batchId, sellingPrice }: { batchId: string; sellingPrice: number }) {
  const [state, action, pending] = useActionState(updateBatchSellingPrice.bind(null, batchId), initial);
  return (
    <form action={action} className="flex items-center justify-end gap-1.5">
      <NumberInput name="sellingPrice" defaultValue={sellingPrice} className="h-8 w-28 text-right" aria-label="Batch selling price" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
