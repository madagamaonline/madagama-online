"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Calculator,
  Coins,
  Loader2,
  LockOpen,
  Save,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createShiftReport,
  openCashDrawerShift,
  recordCashDrawerMovement,
  type ShiftSummary,
} from "@/app/(app)/shift-report/actions";
import {
  CASH_DENOMINATIONS,
  EMPTY_DENOMINATION_COUNTS,
  denominationTotal,
  type DenominationCounts,
} from "@/lib/cash-drawer";
import { formatLKR } from "@/lib/utils";

function DenominationCounter({
  idPrefix,
  counts,
  onChange,
}: {
  idPrefix: string;
  counts: DenominationCounts;
  onChange: (key: keyof DenominationCounts, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CASH_DENOMINATIONS.map((denomination) => {
          const id = `${idPrefix}-${denomination.key}`;
          return (
            <div key={denomination.key}>
              <Label htmlFor={id}>{denomination.label} note count</Label>
              <div className="relative mt-1 flex items-center">
                <NumberInput
                  id={id}
                  name={denomination.key}
                  allowDecimal={false}
                  placeholder="0"
                  value={counts[denomination.key] || ""}
                  onValueChange={(value) => onChange(denomination.key, value)}
                />
                <span className="pointer-events-none absolute right-3 text-[11px] font-bold text-muted">
                  = {formatLKR(counts[denomination.key] * denomination.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-4">
        <Label htmlFor={`${idPrefix}-looseCoins`} className="flex items-center gap-1.5">
          <Coins className="h-4 w-4 text-faint" />
          Coins and loose change total (Rs.)
        </Label>
        <NumberInput
          id={`${idPrefix}-looseCoins`}
          name="looseCoins"
          allowDecimal={false}
          placeholder="e.g. 145"
          value={counts.looseCoins || ""}
          onValueChange={(value) => onChange("looseCoins", value)}
          className="mt-1"
        />
      </div>
    </div>
  );
}

function useDenominationCounts() {
  const [counts, setCounts] = useState<DenominationCounts>({ ...EMPTY_DENOMINATION_COUNTS });
  const changeCount = (key: keyof DenominationCounts, value: string) => {
    const count = Math.max(0, Number.parseInt(value, 10) || 0);
    setCounts((current) => ({ ...current, [key]: count }));
  };
  return { counts, changeCount, total: denominationTotal(counts) };
}

export function OpeningShiftForm({ cashierName }: { cashierName: string }) {
  const { counts, changeCount, total } = useDenominationCounts();
  const [state, formAction, pending] = useActionState(openCashDrawerShift, {});

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 rounded-2xl border border-primary/20 bg-primary-soft p-5">
        <div className="flex gap-3">
          <LockOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" />
          <div>
            <h2 className="font-bold text-foreground">Open today&apos;s cash drawer</h2>
            <p className="mt-1 text-sm text-muted">
              Count the change fund placed in the drawer before taking cash payments. This opening float will be
              included automatically when the shift is closed.
            </p>
          </div>
        </div>
      </div>

      <form action={formAction} className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <div className="mb-6 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-medium text-muted">Opening cashier</p>
            <p className="mt-1 flex items-center gap-2 font-bold"><User className="h-4 w-4 text-primary-ink" />{cashierName}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium text-muted">Opening float</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{formatLKR(total)}</p>
          </div>
        </div>

        {state.error && <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">{state.error}</p>}
        <DenominationCounter idPrefix="opening" counts={counts} onChange={changeCount} />

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
            {pending ? "Opening shift…" : "Confirm & Open Shift"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CashMovementForm({ shiftId }: { shiftId: string }) {
  const [state, formAction, pending] = useActionState(recordCashDrawerMovement, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
      <input type="hidden" name="shiftId" value={shiftId} />
      <h3 className="text-sm font-bold">Cash added or removed</h3>
      <p className="mt-1 text-xs text-muted">Record drawer changes that are not sales or customer refunds.</p>
      {state.error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">{state.error}</p>}
      {state.ok && <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-xs text-success-ink">Cash movement recorded.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="movement-type">Movement</Label>
          <Select id="movement-type" name="type" defaultValue="ADDITION" className="mt-1">
            <option value="ADDITION">Cash added to drawer</option>
            <option value="WITHDRAWAL">Cash removed from drawer</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="movement-amount">Amount</Label>
          <NumberInput id="movement-amount" name="amount" className="mt-1" placeholder="0.00" required />
        </div>
      </div>
      <div className="mt-3">
        <Label htmlFor="movement-reason">Reason</Label>
        <Textarea id="movement-reason" name="reason" className="mt-1 min-h-20" placeholder="Example: Extra change brought from safe" required />
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="mt-3 w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Record movement
      </Button>
    </form>
  );
}

export function ShiftReportForm({ summary, cashierName }: { summary: ShiftSummary; cashierName: string }) {
  const { counts, changeCount, total: actualCash } = useDenominationCounts();
  const [state, formAction, pending] = useActionState(createShiftReport, {});
  const discrepancy = actualCash - summary.expectedCash;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold"><User className="h-4 w-4 text-primary-ink" />Active shift</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted">Opened by</span><span className="font-semibold">{summary.openedByName}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Opened at</span><span className="font-semibold">{new Date(summary.startTime).toLocaleString()}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Closing cashier</span><span className="font-semibold">{cashierName}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <h3 className="mb-4 text-sm font-bold">Expected drawer calculation</h3>
          <div className="space-y-3 text-sm tabular-nums">
            <SummaryLine label="Opening float" value={summary.openingCash} strong />
            <SummaryLine label="Cash sales" value={summary.totalCashSales} />
            <SummaryLine label="Credit repayments" value={summary.totalRepayments} />
            <SummaryLine label="Pay Later collections" value={summary.totalOpenAccountCollections} />
            <SummaryLine label="Layaway installments" value={summary.totalLayawayCollections} />
            {summary.totalCashAdditions > 0 && <SummaryLine label="Cash added" value={summary.totalCashAdditions} icon="in" />}
            {summary.totalCashRefunds > 0 && <SummaryLine label="Cash refunds" value={-summary.totalCashRefunds} icon="out" />}
            {summary.totalCashWithdrawals > 0 && <SummaryLine label="Cash removed" value={-summary.totalCashWithdrawals} icon="out" />}
            <div className="flex justify-between border-t border-border pt-3 font-bold"><span>Expected in drawer</span><span className="text-primary-ink">{formatLKR(summary.expectedCash)}</span></div>
          </div>
        </div>

        <CashMovementForm shiftId={summary.shiftId} />

        {summary.movements.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <h3 className="mb-3 text-sm font-bold">Drawer movement log</h3>
            <div className="space-y-3">
              {summary.movements.map((movement) => (
                <div key={movement.id} className="border-b border-border-subtle pb-3 text-xs last:border-0 last:pb-0">
                  <div className="flex justify-between gap-3"><span className="font-semibold">{movement.reason}</span><span className={movement.type === "ADDITION" ? "text-emerald-700" : "text-danger-ink"}>{movement.type === "ADDITION" ? "+" : "−"}{formatLKR(movement.amount)}</span></div>
                  <p className="mt-1 text-faint">{movement.operatorName} · {new Date(movement.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <form action={formAction} className="space-y-6 lg:col-span-3">
        <input type="hidden" name="shiftId" value={summary.shiftId} />
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6">
          <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Calculator className="h-4 w-4 text-primary-ink" />Closing cash count</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-faint">LKR counter</span>
          </div>
          {state.error && <p className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-xs text-danger-ink">{state.error}</p>}
          <DenominationCounter idPrefix="closing" counts={counts} onChange={changeCount} />

          <div className="mt-6 space-y-4 rounded-xl border border-border bg-background p-4.5">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs font-medium text-muted">Physical cash counted</p><p className="mt-0.5 text-2xl font-black">{formatLKR(actualCash)}</p></div>
              <div className="text-right"><p className="text-xs font-medium text-muted">Expected</p><p className="mt-1 font-bold text-muted">{formatLKR(summary.expectedCash)}</p></div>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-border pt-3">
              <span className="text-xs font-semibold text-muted">Drawer discrepancy</span>
              {discrepancy === 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />Balanced</span>
              ) : discrepancy < 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger-ink"><AlertTriangle className="h-4 w-4" />Shortage: {formatLKR(Math.abs(discrepancy))}</span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><AlertTriangle className="h-4 w-4" />Overage: {formatLKR(discrepancy)}</span>
              )}
            </div>
          </div>

          <div className="mt-5">
            <Label htmlFor="closing-notes">Discrepancy notes / closing remarks</Label>
            <Textarea id="closing-notes" name="notes" className="mt-1 min-h-24" placeholder="Explain any shortage, overage, or unusual drawer activity…" />
          </div>

          <div className="mt-5 flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {pending ? "Closing shift…" : "Save & Close Shift"}<ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SummaryLine({ label, value, strong = false, icon }: { label: string; value: number; strong?: boolean; icon?: "in" | "out" }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <span className="flex items-center gap-1.5 text-muted">
        {icon === "in" && <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />}
        {icon === "out" && <ArrowUpFromLine className="h-3.5 w-3.5 text-danger" />}
        {label}
      </span>
      <span className="font-semibold">{value < 0 ? "−" : ""}{formatLKR(Math.abs(value))}</span>
    </div>
  );
}
