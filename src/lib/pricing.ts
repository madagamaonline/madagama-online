import { round2 } from "@/lib/utils";

/**
 * Pricing maths shared by the product form (client), the bulk re-pricer, and the
 * purchase WAC tracker. Pure functions only — no `server-only` import — so they
 * run in the browser and in unit tests.
 *
 * Convention: "margin" always means GROSS MARGIN measured on the SELLING price,
 * matching how margin is displayed elsewhere in the app. "Markup" is measured on
 * the cost. All money results are rounded to 2 decimals; percentages are not.
 */

/** Default psychological-rounding step (LKR). Prices snap to the nearest 5. */
export const DEFAULT_ROUND_STEP = 5;

/** Gross margin % = (price − cost) / price × 100. Returns 0 when price ≤ 0. */
export function grossMarginPct(cost: number, price: number): number {
  if (!(price > 0)) return 0;
  return ((price - cost) / price) * 100;
}

/** Markup % = (price − cost) / cost × 100. Returns 0 when cost ≤ 0. */
export function markupPct(cost: number, price: number): number {
  if (!(cost > 0)) return 0;
  return ((price - cost) / cost) * 100;
}

/** Profit per unit in LKR. */
export function profit(cost: number, price: number): number {
  return round2(price - cost);
}

/**
 * Selling price that yields the given gross margin on `cost`.
 * price = cost / (1 − margin/100). Guards margins ≥ 100% (would be infinite) and
 * non-positive cost.
 */
export function priceFromMargin(cost: number, marginPct: number): number {
  if (!(cost > 0)) return 0;
  if (marginPct >= 100) return cost; // can't reach 100%+ margin; leave at cost
  if (marginPct <= 0) return round2(cost);
  return round2(cost / (1 - marginPct / 100));
}

/**
 * New weighted-average cost after buying `addQty` units at `addCost`.
 * If there is no usable existing stock (qty ≤ 0), the average is just the new
 * cost — avoids a divide-by-zero / nonsense average from negative balances.
 */
export function weightedAvgCost(
  curQty: number,
  curCost: number,
  addQty: number,
  addCost: number,
): number {
  if (!(curQty > 0)) return round2(addCost);
  if (!(addQty > 0)) return round2(curCost);
  return round2((curQty * curCost + addQty * addCost) / (curQty + addQty));
}

/**
 * Round to the nearest multiple of `step` (e.g. 133.33 → 135 at step 5).
 * A step of 0 (or less) means "no psychological rounding" — just round to 2dp.
 */
export function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return round2(value);
  return Math.round(value / step) * step;
}
