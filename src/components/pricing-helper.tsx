"use client";

import { useState } from "react";
import {
  grossMarginPct,
  markupPct,
  profit,
  priceFromMargin,
  roundToStep,
  DEFAULT_ROUND_STEP,
} from "@/lib/pricing";
import { formatLKR } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Live pricing helper shown under the cost/selling-price inputs on the product
 * form. Reads the current cost, selling price and target margin (controlled by
 * the parent form) and shows margin / markup / profit as they type. The "Apply"
 * button computes a selling price for the target margin and hands it back to the
 * parent via `onApplyPrice`. All maths live in `@/lib/pricing`.
 */
export function PricingHelper({
  cost,
  price,
  targetMarginPct,
  defaultTargetMarginPct,
  onApplyPrice,
}: {
  cost: number;
  price: number;
  targetMarginPct: number; // 0 / NaN ⇒ use the default
  defaultTargetMarginPct: number;
  onApplyPrice: (price: number) => void;
}) {
  const [round, setRound] = useState(true);

  const margin = grossMarginPct(cost, price);
  const markup = markupPct(cost, price);
  const unitProfit = profit(cost, price);
  const belowCost = price > 0 && cost > 0 && price < cost;

  const effectiveTarget = targetMarginPct > 0 ? targetMarginPct : defaultTargetMarginPct;
  const step = round ? DEFAULT_ROUND_STEP : 0;
  const suggested = roundToStep(priceFromMargin(cost, effectiveTarget), step);

  return (
    <div className="rounded-xl border border-border bg-input/60 p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Gross margin" value={`${margin.toFixed(1)}%`} tone={margin < 0 ? "bad" : "ok"} />
        <Stat label="Markup" value={`${markup.toFixed(1)}%`} />
        <Stat
          label="Profit / unit"
          value={formatLKR(unitProfit)}
          tone={unitProfit < 0 ? "bad" : "ok"}
        />
      </div>

      {belowCost && (
        <p className="mt-3 text-xs font-medium text-danger">
          Selling price is below cost — this item would sell at a loss.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <span className="text-sm text-muted">
          Price for{" "}
          <b className="text-foreground">{effectiveTarget.toFixed(1)}%</b> target margin:{" "}
          <b className="tabular text-foreground">{formatLKR(suggested)}</b>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!(cost > 0) || !(suggested > 0)}
          onClick={() => onApplyPrice(suggested)}
        >
          Apply to selling price
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={round}
            onChange={(e) => setRound(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Round to nearest {DEFAULT_ROUND_STEP}
        </label>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "neutral";
}) {
  const color = tone === "bad" ? "text-danger" : tone === "ok" ? "text-primary" : "text-foreground";
  return (
    <div>
      <div className={`tabular text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
