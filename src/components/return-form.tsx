"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { createReturn } from "@/app/(app)/returns/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatLKR } from "@/lib/utils";

export type ReturnLine = {
  productId: string;
  code: string;
  name: string;
  sold: number;
  unitPrice: number;
};

export function ReturnForm({ invoiceId, lines }: { invoiceId: string; lines: ReturnLine[] }) {
  const router = useRouter();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [method, setMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const refund = lines.reduce((s, l) => s + (qtys[l.productId] || 0) * l.unitPrice, 0);

  function setQty(productId: string, value: number, max: number) {
    setQtys((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(max, Math.trunc(value) || 0)) }));
  }

  function submit() {
    setError("");
    const out = lines
      .filter((l) => (qtys[l.productId] || 0) > 0)
      .map((l) => ({ productId: l.productId, qty: qtys[l.productId], unitPrice: l.unitPrice }));
    if (out.length === 0) return setError("Enter a return quantity for at least one item.");
    start(async () => {
      const res = await createReturn({ invoiceId, method, reason, lines: out });
      if (!res.ok) return setError(res.error);
      router.push("/returns");
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
              <th className="px-2 text-right font-medium">Sold</th>
              <th className="px-2 text-right font-medium">Unit price</th>
              <th className="px-2 text-right font-medium">Return qty</th>
              <th className="py-2 pl-2 text-right font-medium">Refund</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const q = qtys[l.productId] || 0;
              return (
                <tr key={l.productId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-2">
                    <div className="font-mono text-xs font-semibold text-primary">{l.code}</div>
                    <div className="font-medium">{l.name}</div>
                  </td>
                  <td className="px-2 text-right">{l.sold}</td>
                  <td className="px-2 text-right">{formatLKR(l.unitPrice)}</td>
                  <td className="px-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      max={l.sold}
                      value={q || ""}
                      onChange={(e) => setQty(l.productId, Number(e.target.value), l.sold)}
                      className="h-9 w-20 text-right"
                    />
                  </td>
                  <td className="py-2 pl-2 text-right font-medium">{formatLKR(q * l.unitPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="method">Refund method</Label>
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="CREDIT_NOTE">Credit note</option>
              <option value="EXCHANGE">Exchange</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Faulty, wrong item" />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-muted">Total refund</span>
          <span className="text-lg font-semibold">{formatLKR(refund)}</span>
        </div>

        <Button onClick={submit} disabled={pending} className="w-full" size="lg">
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Undo2 className="h-5 w-5" />}
          {pending ? "Saving…" : "Process return & restock"}
        </Button>
      </CardContent>
    </Card>
  );
}
