"use client";

import { Select } from "@/components/ui/select";
import { formatDate, formatLKR } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";

/** A stock batch as returned by /api/products/search (oldest first). */
export type StockBatchOption = {
  id: string;
  label: string | null;
  receivedAt: string;
  qty: number;
  costPrice: number;
  sellingPrice: number;
};

export function findBatch(batches: StockBatchOption[] | undefined, id: string | null | undefined) {
  return (id && batches?.find((b) => b.id === id)) || null;
}

/** Oldest batch with stock — what the till sells first unless told otherwise. */
export function defaultBatch(batches: StockBatchOption[] | undefined) {
  return batches?.[0] ?? null;
}

function optionLabel(b: StockBatchOption, metres: boolean) {
  return [
    formatDate(b.receivedAt),
    `${formatQuantity(b.qty, metres ? "METER" : "EACH")} left`,
    `${formatLKR(b.sellingPrice)} (cost ${formatLKR(b.costPrice)})`,
    b.label,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Pick which stock batch a cart line sells from. Hidden when the product has
 * only one batch. If the line needs more than the batch holds, the rest comes
 * from the oldest other batches — the hint says so.
 */
export function BatchSelect({
  batches,
  value,
  qty,
  metres = false,
  productName,
  onChange,
  className = "",
}: {
  batches: StockBatchOption[] | undefined;
  value: string | null | undefined;
  qty: number;
  metres?: boolean;
  productName: string;
  onChange: (batch: StockBatchOption) => void;
  className?: string;
}) {
  if (!batches || batches.length < 2) return null;
  const chosen = findBatch(batches, value) ?? batches[0]!;
  const overflow = qty - chosen.qty;
  return (
    <div className={className}>
      <Select
        value={chosen.id}
        onChange={(e) => {
          const next = findBatch(batches, e.target.value);
          if (next) onChange(next);
        }}
        className="h-8 w-full min-w-0 py-1 text-xs"
        title={optionLabel(chosen, metres)}
        aria-label={`Stock batch for ${productName}`}
      >
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {optionLabel(b, metres)}
          </option>
        ))}
      </Select>
      {overflow > 0 && (
        <div className="mt-0.5 text-[11px] text-clay-ink">
          {formatQuantity(chosen.qty, metres ? "METER" : "EACH")} from this batch,{" "}
          {formatQuantity(overflow, metres ? "METER" : "EACH")} from the next oldest
        </div>
      )}
    </div>
  );
}
