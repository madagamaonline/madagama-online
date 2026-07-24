"use client";

import { useActionState, useState } from "react";
import { Calculator, AlertTriangle, ShieldCheck, Coins, Save, ArrowRight, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createShiftReport, type ShiftSummary } from "@/app/(app)/shift-report/actions";
import { formatLKR } from "@/lib/utils";

type Denominations = {
  n5000: number;
  n2000: number;
  n1000: number;
  n500: number;
  n100: number;
  n50: number;
  n20: number;
  looseCoins: number;
};

export function ShiftReportForm({
  summary,
  cashierName,
}: {
  summary: ShiftSummary;
  cashierName: string;
}) {
  const [counts, setCounts] = useState<Denominations>({
    n5000: 0,
    n2000: 0,
    n1000: 0,
    n500: 0,
    n100: 0,
    n50: 0,
    n20: 0,
    looseCoins: 0,
  });

  const handleCountChange = (key: keyof Denominations, value: string) => {
    const num = Math.max(0, parseInt(value) || 0);
    setCounts((prev) => ({
      ...prev,
      [key]: num,
    }));
  };

  const actualCash =
    counts.n5000 * 5000 +
    counts.n2000 * 2000 +
    counts.n1000 * 1000 +
    counts.n500 * 500 +
    counts.n100 * 100 +
    counts.n50 * 50 +
    counts.n20 * 20 +
    counts.looseCoins;

  const expectedCash = summary.expectedCash;
  const discrepancy = actualCash - expectedCash;

  const [state, formAction, pending] = useActionState(createShiftReport, {});

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-5">
      {/* Only the physically counted cash is sent — the server re-derives the
          shift window, expected cash, and discrepancy so they can't be forged. */}
      <input type="hidden" name="actualCash" value={actualCash} />

      {/* Left Column: Shift Details & Operator Info (2 cols) */}
      <div className="space-y-6 lg:col-span-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-primary-ink" />
            Shift Operator Info
          </h3>
          <div className="space-y-4">
            <div>
              <Label>Active Cashier</Label>
              <div className="flex h-11 items-center rounded-xl border border-input-border bg-input px-4 text-sm font-medium">
                {cashierName}
              </div>
              <p className="mt-1 text-xs text-muted">
                The logged-in cashier — switch user from the top bar to change.
              </p>
            </div>

            <div className="border-t border-border pt-4 mt-2 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Shift Started:</span>
                <span className="font-semibold text-foreground">
                  {new Date(summary.startTime).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Reporting Time:</span>
                <span className="font-semibold text-foreground">
                  {new Date().toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-foreground">System Sales Summary</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted">Cash Sales:</span>
              <span className="font-semibold text-foreground">{formatLKR(summary.totalCashSales)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted">Repayments (Cash):</span>
              <span className="font-semibold text-foreground">{formatLKR(summary.totalRepayments)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted">Pay Later collections (Cash):</span>
              <span className="font-semibold text-foreground">{formatLKR(summary.totalOpenAccountCollections)}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted">Layaway installments</span>
              <span className="font-semibold text-foreground">{formatLKR(summary.totalLayawayCollections)}</span>
            </div>
            <div className="border-t border-border pt-3 flex justify-between items-center text-sm font-bold">
              <span>Expected in Drawer:</span>
              <span className="text-primary-ink">{formatLKR(expectedCash)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <Label htmlFor="notes">Discrepancy Notes / Remarks</Label>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Add explanation for discrepancies, drawer shortages, or specific shift notes here..."
            className="mt-1 h-24"
          />
        </div>
      </div>

      {/* Right Column: Cash Denominations Calculator & Submit (3 cols) */}
      <div className="space-y-6 lg:col-span-3">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Calculator className="h-4.5 w-4.5 text-primary-ink" />
              Cash Drawer Denominations
            </h3>
            <span className="text-[10px] uppercase font-bold text-faint tracking-wider">LKR Currency Counter</span>
          </div>

          {state?.error && (
            <div className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-xs text-danger-ink">
              {state.error}
            </div>
          )}

          {/* Counts Input Form Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="n5000">Rs. 5,000 Note count</Label>
                <div className="relative mt-1 flex items-center">
                  <NumberInput
                    id="n5000"
                    allowDecimal={false}
                    placeholder="0"
                    value={counts.n5000 || ""}
                    onValueChange={(c) => handleCountChange("n5000", c)}
                  />
                  <span className="absolute right-3 text-[11px] font-bold text-muted pointer-events-none">
                    = {formatLKR(counts.n5000 * 5000)}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="n2000">Rs. 2,000 Note count</Label>
                <div className="relative mt-1 flex items-center">
                  <NumberInput
                    id="n2000"
                    allowDecimal={false}
                    placeholder="0"
                    value={counts.n2000 || ""}
                    onValueChange={(c) => handleCountChange("n2000", c)}
                  />
                  <span className="absolute right-3 text-[11px] font-bold text-muted pointer-events-none">
                    = {formatLKR(counts.n2000 * 2000)}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="n1000">Rs. 1,000 Note count</Label>
                <div className="relative mt-1 flex items-center">
                  <NumberInput
                    id="n1000"
                    allowDecimal={false}
                    placeholder="0"
                    value={counts.n1000 || ""}
                    onValueChange={(c) => handleCountChange("n1000", c)}
                  />
                  <span className="absolute right-3 text-[11px] font-bold text-muted pointer-events-none">
                    = {formatLKR(counts.n1000 * 1000)}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="n500">Rs. 500 Note count</Label>
                <div className="relative mt-1 flex items-center">
                  <NumberInput
                    id="n500"
                    allowDecimal={false}
                    placeholder="0"
                    value={counts.n500 || ""}
                    onValueChange={(c) => handleCountChange("n500", c)}
                  />
                  <span className="absolute right-3 text-[11px] font-bold text-muted pointer-events-none">
                    = {formatLKR(counts.n500 * 500)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="n100">Rs. 100 Note count</Label>
                <div className="relative mt-1 flex items-center">
                  <NumberInput
                    id="n100"
                    allowDecimal={false}
                    placeholder="0"
                    value={counts.n100 || ""}
                    onValueChange={(c) => handleCountChange("n100", c)}
                  />
                  <span className="absolute right-3 text-[11px] font-bold text-muted pointer-events-none">
                    = {formatLKR(counts.n100 * 100)}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="n50">Rs. 50 Note count</Label>
                <div className="relative mt-1 flex items-center">
                  <NumberInput
                    id="n50"
                    allowDecimal={false}
                    placeholder="0"
                    value={counts.n50 || ""}
                    onValueChange={(c) => handleCountChange("n50", c)}
                  />
                  <span className="absolute right-3 text-[11px] font-bold text-muted pointer-events-none">
                    = {formatLKR(counts.n50 * 50)}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="n20">Rs. 20 Note count</Label>
                <div className="relative mt-1 flex items-center">
                  <NumberInput
                    id="n20"
                    allowDecimal={false}
                    placeholder="0"
                    value={counts.n20 || ""}
                    onValueChange={(c) => handleCountChange("n20", c)}
                  />
                  <span className="absolute right-3 text-[11px] font-bold text-muted pointer-events-none">
                    = {formatLKR(counts.n20 * 20)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <Label htmlFor="looseCoins" className="flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-faint" />
              Coins & Loose Change Sum (Rs.)
            </Label>
            <NumberInput
              id="looseCoins"
              allowDecimal={false}
              placeholder="e.g. 145"
              value={counts.looseCoins || ""}
              onValueChange={(c) => handleCountChange("looseCoins", c)}
              className="mt-1"
            />
          </div>

          {/* Reconciliation Dashboard Result */}
          <div className="rounded-xl border border-border bg-background p-4.5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-muted font-medium">Physical Cash Sum (Actual)</p>
                <p className="text-2xl font-black text-foreground mt-0.5">{formatLKR(actualCash)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted font-medium">System Expected Cash</p>
                <p className="text-base font-bold text-muted mt-1">{formatLKR(expectedCash)}</p>
              </div>
            </div>

            <div className="border-t border-dashed border-border pt-3 flex justify-between items-center">
              <span className="text-xs font-semibold text-muted">Drawer Discrepancy:</span>
              {discrepancy === 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                  Balanced
                </span>
              ) : discrepancy < 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger-ink">
                  <AlertTriangle className="h-4 w-4" />
                  Shortage: {formatLKR(Math.abs(discrepancy))}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  <AlertTriangle className="h-4 w-4" />
                  Overage: {formatLKR(discrepancy)}
                </span>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {pending ? "Saving Shift..." : "Save & Close Shift"}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
