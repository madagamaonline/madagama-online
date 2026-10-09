"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Undo2 } from "lucide-react";
import { createReturn } from "@/app/(app)/returns/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { round2, formatLKR } from "@/lib/utils";
import { ActionButtonContent, ActionFeedback, waitForSuccessFrame } from "@/components/ui/action-feedback";
import type { UnitOfMeasure } from "@prisma/client";
import { formatQuantity } from "@/lib/units";
import { saveExchangeDraft, type ExchangeDraft } from "@/lib/exchange-draft";

export type ReturnLine = {
  productId: string;
  code: string;
  name: string;
  sold: number;
  unit: UnitOfMeasure;
  unitPrice: number;
  refundableValue: number;
};

export function ReturnForm({
  invoiceId,
  invoiceNumber,
  customer,
  lines,
  creditOutstanding,
  prefillProductId,
}: {
  invoiceId: string;
  invoiceNumber: string;
  customer: ExchangeDraft["customer"];
  lines: ReturnLine[];
  /** Outstanding balance when the invoice is an unsettled credit sale — the
   *  refund reduces this balance instead of being paid out. */
  creditOutstanding?: number | null;
  /** Line chosen from the invoice's per-item return button. */
  prefillProductId?: string | null;
}) {
  const isCredit = creditOutstanding != null;
  const router = useRouter();
  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const line = lines.find((l) => l.productId === prefillProductId);
    if (!line) return {};
    return { [line.productId]: line.unit === "EACH" ? Math.min(1, line.sold) : line.sold };
  });
  const [damaged, setDamaged] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const lineValue = (l: ReturnLine) => round2(l.refundableValue * (qtys[l.productId] || 0) / l.sold);
  const refund = round2(lines.reduce((s, l) => s + lineValue(l), 0));
  const toBalance = isCredit ? round2(Math.min(creditOutstanding, refund)) : 0;
  const cashPortion = round2(refund - toBalance);

  function setQty(productId: string, value: number, max: number) {
    setQtys((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(max, value || 0)) }));
  }

  function selectedLines(): ReturnLine[] | null {
    setError("");
    if (lines.some((l) => l.unit === "EACH" && !Number.isInteger(qtys[l.productId] || 0))) {
      setError("Piece products must be returned in whole quantities.");
      return null;
    }
    const chosen = lines.filter((l) => (qtys[l.productId] || 0) > 0);
    if (chosen.length === 0) {
      setError("Enter a return quantity for at least one item.");
      return null;
    }
    return chosen;
  }

  function refundCash() {
    setSaved(false);
    const chosen = selectedLines();
    if (!chosen) return;
    const out = chosen.map((l) => ({
      productId: l.productId,
      qty: qtys[l.productId],
      unitPrice: l.unitPrice,
      restock: !damaged[l.productId],
    }));
    start(async () => {
      const res = await createReturn({ invoiceId, method: "CASH", reason, lines: out });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      await waitForSuccessFrame();
      router.push("/returns");
    });
  }

  function startExchange() {
    const chosen = selectedLines();
    if (!chosen) return;
    const ok = saveExchangeDraft({
      invoiceId,
      invoiceNumber,
      customer,
      reason,
      lines: chosen.map((l) => ({
        productId: l.productId,
        name: l.name,
        qty: qtys[l.productId],
        restock: !damaged[l.productId],
        value: lineValue(l),
      })),
      credit: cashPortion,
    });
    if (!ok) return setError("This browser could not hold the exchange. Check that site storage is allowed.");
    router.push("/invoices/new");
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <ActionFeedback error={error} />

        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="px-2 text-right font-medium">Returnable</th>
                <th className="px-2 text-right font-medium">Unit price</th>
                <th className="px-2 text-right font-medium">Return qty</th>
                <th className="py-2 pl-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const q = qtys[l.productId] || 0;
                return (
                  <tr key={l.productId} className={`border-b border-border last:border-0 ${q > 0 ? "bg-primary-soft/40" : ""}`}>
                    <td className="py-2 pr-2">
                      <div className="font-mono text-xs font-semibold text-primary">{l.code}</div>
                      <div className="font-medium">{l.name}</div>
                      {q > 0 && (
                        <Select
                          aria-label={`Condition of ${l.name}`}
                          value={damaged[l.productId] ? "DAMAGED" : "RESTOCK"}
                          onChange={(e) => setDamaged((prev) => ({ ...prev, [l.productId]: e.target.value === "DAMAGED" }))}
                          className="mt-1.5 h-8 w-auto py-0 text-xs"
                        >
                          <option value="RESTOCK">Good — back to stock</option>
                          <option value="DAMAGED">Damaged — keep off the shelf</option>
                        </Select>
                      )}
                    </td>
                    <td className="px-2 text-right">{formatQuantity(l.sold, l.unit)}</td>
                    <td className="px-2 text-right">{formatLKR(l.unitPrice)}</td>
                    <td className="px-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        max={l.sold}
                        step={l.unit === "EACH" ? "1" : "0.0001"}
                        value={q || ""}
                        onChange={(e) => setQty(l.productId, Number(e.target.value), l.sold)}
                        className="ml-auto h-9 w-20 text-right"
                        aria-label={`Return quantity for ${l.name}`}
                      />
                    </td>
                    <td className="py-2 pl-2 text-right font-medium">{formatLKR(lineValue(l))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <Label htmlFor="reason">Reason (optional)</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong item, faulty, wrong size" />
        </div>

        {isCredit && refund > 0 && (
          <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">
            This is a credit sale with {formatLKR(creditOutstanding)} still outstanding.{" "}
            {cashPortion <= 0 ? (
              <>The full {formatLKR(refund)} will be credited against the customer&apos;s balance, so there is nothing to refund or exchange against.</>
            ) : (
              <>
                {formatLKR(toBalance)} will be credited against the balance (settling it); the remaining{" "}
                {formatLKR(cashPortion)} can be refunded in cash or used towards an exchange.
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-muted">{isCredit ? "Refundable / exchange value" : "Return value"}</span>
          <span className="text-lg font-semibold tabular">{formatLKR(isCredit ? cashPortion : refund)}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button onClick={refundCash} disabled={pending} variant="outline" className={saved ? "bg-success text-white hover:bg-success" : ""} size="lg" aria-live="polite">
            <ActionButtonContent pending={pending} success={saved} idleLabel={cashPortion > 0 ? `Refund ${formatLKR(cashPortion)} cash` : "Process return"} pendingLabel="Saving…" successLabel="Return processed" idleIcon={<Undo2 className="h-5 w-5" />} />
          </Button>
          <Button onClick={startExchange} disabled={pending || (refund > 0 && cashPortion <= 0)} size="lg">
            <ArrowLeftRight className="h-5 w-5" /> Exchange for other items
          </Button>
        </div>
        <p className="text-xs text-muted">
          Exchange opens a new sale with this value already taken off. If the new items cost less, give the
          difference back in cash. Nothing is saved until that sale is completed.
        </p>
      </CardContent>
    </Card>
  );
}
