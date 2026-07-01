"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageX } from "lucide-react";
import { createSupplierReturn } from "@/app/(app)/supplier-returns/actions";
import { NumberInput } from "@/components/ui/number-input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatLKR } from "@/lib/utils";

export type SupplierReturnLine = {
  productId: string;
  code: string;
  name: string;
  purchased: number;
  inStock: number;
  unitCost: number;
};

export function SupplierReturnForm({
  purchaseId,
  balance,
  lines,
}: {
  purchaseId: string;
  balance: number;
  lines: SupplierReturnLine[];
}) {
  const router = useRouter();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, number>>(
    () => Object.fromEntries(lines.map((l) => [l.productId, l.unitCost])),
  );
  const [method, setMethod] = useState<"REDUCE_PAYABLE" | "CASH_REFUND" | "REPLACEMENT">("REDUCE_PAYABLE");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const value = lines.reduce((s, l) => s + (qtys[l.productId] || 0) * (costs[l.productId] ?? 0), 0);
  const applied = method === "REDUCE_PAYABLE" ? Math.min(balance, value) : 0;

  // Cap the return qty at whatever is currently in stock — you can't send back
  // more than you're holding — and never above what was originally purchased.
  function setQty(productId: string, val: number, max: number) {
    setQtys((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(max, Math.trunc(val) || 0)) }));
  }

  function submit() {
    setError("");
    const out = lines
      .filter((l) => (qtys[l.productId] || 0) > 0)
      .map((l) => ({ productId: l.productId, qty: qtys[l.productId], unitCost: costs[l.productId] ?? 0 }));
    if (out.length === 0) return setError("Enter a return quantity for at least one item.");
    start(async () => {
      const res = await createSupplierReturn({ purchaseId, method, reason, lines: out });
      if (!res.ok) return setError(res.error);
      router.push("/supplier-returns");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</div>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="px-2 text-right font-medium">Bought</th>
              <th className="px-2 text-right font-medium">In stock</th>
              <th className="px-2 text-right font-medium">Return qty</th>
              <th className="px-2 text-right font-medium">Unit cost</th>
              <th className="py-2 pl-2 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const q = qtys[l.productId] || 0;
              const max = Math.min(l.purchased, l.inStock);
              return (
                <tr key={l.productId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-2">
                    <div className="font-mono text-xs font-semibold text-primary">{l.code}</div>
                    <div className="font-medium">{l.name}</div>
                  </td>
                  <td className="px-2 text-right">{l.purchased}</td>
                  <td className="px-2 text-right">{l.inStock}</td>
                  <td className="px-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      max={max}
                      value={q || ""}
                      onChange={(e) => setQty(l.productId, Number(e.target.value), max)}
                      className="h-9 w-20 text-right"
                    />
                  </td>
                  <td className="px-2 text-right">
                    <NumberInput
                      value={costs[l.productId] ?? 0}
                      onValueChange={(clean) =>
                        setCosts((prev) => ({ ...prev, [l.productId]: Number(clean) || 0 }))
                      }
                      className="h-9 w-28 text-right"
                    />
                  </td>
                  <td className="py-2 pl-2 text-right font-medium">
                    {formatLKR(q * (costs[l.productId] ?? 0))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="method">How is it settled?</Label>
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="REDUCE_PAYABLE">Reduce what we owe (credit note)</option>
              <option value="CASH_REFUND">Cash refund from supplier</option>
              <option value="REPLACEMENT">Replacement goods</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective, wrong item, over-supply" />
          </div>
        </div>

        <div className="space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Return value</span>
            <span className="text-lg font-semibold">{formatLKR(value)}</span>
          </div>
          {method === "REDUCE_PAYABLE" && (
            <div className="flex items-center justify-between text-muted">
              <span>Applied to this purchase’s balance (owed: {formatLKR(balance)})</span>
              <span className="font-medium text-clay-ink">−{formatLKR(applied)}</span>
            </div>
          )}
          {method === "REDUCE_PAYABLE" && value > balance && (
            <p className="text-xs text-muted">
              Return value exceeds the outstanding balance — only {formatLKR(balance)} is credited here.
              Settle the rest as a cash refund separately.
            </p>
          )}
        </div>

        <Button onClick={submit} disabled={pending} className="w-full" size="lg">
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageX className="h-5 w-5" />}
          {pending ? "Saving…" : "Return to supplier & remove stock"}
        </Button>
      </CardContent>
    </Card>
  );
}
