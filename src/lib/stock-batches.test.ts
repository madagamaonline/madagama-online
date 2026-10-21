import { describe, expect, it } from "vitest";
import { planBatchTake, weightedTakeCost } from "./stock-batches";

const batches = [
  { id: "old", qtyRemaining: 3, costPrice: 100_000 },
  { id: "mid", qtyRemaining: 2, costPrice: 110_000 },
  { id: "new", qtyRemaining: 5, costPrice: 90_000 },
];

describe("planBatchTake", () => {
  it("takes oldest first when no batch is chosen", () => {
    expect(planBatchTake(batches, 4)).toEqual({
      takes: [
        { batchId: "old", qty: 3, costPrice: 100_000 },
        { batchId: "mid", qty: 1, costPrice: 110_000 },
      ],
      shortfall: 0,
    });
  });

  it("takes the chosen batch first, then overflows oldest-first", () => {
    expect(planBatchTake(batches, 7, "new").takes).toEqual([
      { batchId: "new", qty: 5, costPrice: 90_000 },
      { batchId: "old", qty: 2, costPrice: 100_000 },
    ]);
  });

  it("falls back to oldest-first when the chosen batch is gone", () => {
    expect(planBatchTake(batches, 1, "sold-out").takes).toEqual([{ batchId: "old", qty: 1, costPrice: 100_000 }]);
  });

  it("reports a shortfall when batches cannot cover the quantity", () => {
    expect(planBatchTake(batches, 12).shortfall).toBe(2);
  });

  it("handles fractional metre quantities", () => {
    const plan = planBatchTake([{ id: "a", qtyRemaining: 1.25, costPrice: 50 }, { id: "b", qtyRemaining: 10, costPrice: 60 }], 2.5);
    expect(plan.takes.map((t) => t.qty)).toEqual([1.25, 1.25]);
  });
});

describe("weightedTakeCost", () => {
  it("weights each batch by quantity", () => {
    expect(weightedTakeCost([
      { batchId: "old", qty: 3, costPrice: 100_000 },
      { batchId: "mid", qty: 1, costPrice: 110_000 },
    ], 0, 0)).toBe(102_500);
  });

  it("values a shortfall at the fallback cost", () => {
    expect(weightedTakeCost([{ batchId: "a", qty: 1, costPrice: 100 }], 1, 200)).toBe(150);
  });

  it("returns the fallback when nothing was taken", () => {
    expect(weightedTakeCost([], 0, 75)).toBe(75);
  });
});
