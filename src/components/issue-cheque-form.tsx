"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsRight, Loader2 } from "lucide-react";
import { issueCheque, type BankingActionState } from "@/app/(app)/banking/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { SearchSelect } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatLKR } from "@/lib/utils";

type Supplier = { id: string; name: string };
type Account = { id: string; bankName: string; accountName: string; accountNumber: string };
type Purchase = { id: string; supplierId: string; ref: string; date: string; remaining: number };
const initial: BankingActionState = {};

export function IssueChequeForm({
  suppliers,
  accounts,
  purchases,
  defaultSupplierId = "",
  defaultPurchaseId = "",
}: {
  suppliers: Supplier[];
  accounts: Account[];
  purchases: Purchase[];
  defaultSupplierId?: string;
  defaultPurchaseId?: string;
}) {
  const router = useRouter();
  const defaultPurchase = purchases.find((purchase) => purchase.id === defaultPurchaseId);
  const [supplierId, setSupplierId] = useState(defaultPurchase?.supplierId || defaultSupplierId);
  const [purchaseId, setPurchaseId] = useState(defaultPurchaseId);
  const [state, action, pending] = useActionState(issueCheque, initial);
  const today = new Date().toISOString().slice(0, 10);
  const supplierPurchases = useMemo(() => purchases.filter((purchase) => purchase.supplierId === supplierId), [purchases, supplierId]);

  useEffect(() => {
    if (state.ok && state.id) router.push(`/banking/cheques/${state.id}`);
  }, [state, router]);

  const selectedPurchase = purchases.find((purchase) => purchase.id === purchaseId);
  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader><CardTitle>Cheque details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {state.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p>}
          <div>
            <Label>Supplier</Label>
            <SearchSelect
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              value={supplierId}
              onChange={(value) => { setSupplierId(value); setPurchaseId(""); }}
              placeholder="Select supplier…"
              searchPlaceholder="Search suppliers…"
              emptyText="No suppliers found."
            />
            <input type="hidden" name="supplierId" value={supplierId} />
          </div>
          <div>
            <Label htmlFor="purchaseId">Link to credit purchase (optional)</Label>
            <Select id="purchaseId" name="purchaseId" value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)} disabled={!supplierId}>
              <option value="">No linked purchase</option>
              {supplierPurchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.ref} · {formatLKR(purchase.remaining)} remaining</option>)}
            </Select>
            {supplierId && supplierPurchases.length === 0 && <p className="mt-1 text-xs text-muted">This supplier has no outstanding credit purchases.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="bankAccountId">Bank account</Label><Select id="bankAccountId" name="bankAccountId" required defaultValue=""><option value="" disabled>Select account…</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.bankName} · {account.accountName} · {account.accountNumber}</option>)}</Select></div>
            <div><Label htmlFor="chequeNumber">Cheque number</Label><Input id="chequeNumber" name="chequeNumber" className="font-mono" required /></div>
            <div><Label htmlFor="issuedDate">Issue date</Label><Input id="issuedDate" name="issuedDate" type="date" defaultValue={today} required /></div>
            <div><Label htmlFor="dueDate">Due date</Label><Input id="dueDate" name="dueDate" type="date" required /></div>
          </div>
          <div><Label htmlFor="amount">Cheque amount (LKR)</Label><NumberInput id="amount" name="amount" min="0.01" required /></div>
          <div><Label htmlFor="notes">Notes (optional)</Label><Textarea id="notes" name="notes" rows={3} /></div>
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card className="border-primary/30 bg-primary-soft/30">
          <CardHeader><CardTitle>Liability hand-off</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedPurchase ? (
              <>
                <div><p className="text-xs text-muted">Selected purchase</p><p className="font-semibold">{selectedPurchase.ref}</p><p className="text-xs text-muted">{formatDate(new Date(selectedPurchase.date))}</p></div>
                <div><p className="text-xs text-muted">Supplier balance remaining</p><p className="text-xl font-bold tabular-nums">{formatLKR(selectedPurchase.remaining)}</p></div>
              </>
            ) : <p className="text-muted">Choose an outstanding purchase to record the cheque in its supplier payment history.</p>}
            <div className="flex items-start gap-2 border-t border-primary/20 pt-3 text-xs text-primary-ink"><ChevronsRight className="mt-0.5 h-4 w-4 shrink-0" /><p>The applied amount moves from supplier credit into this cheque’s bank liability. Repayments then reduce the cheque balance.</p></div>
          </CardContent>
        </Card>
        <Button type="submit" className="w-full" disabled={pending || !supplierId || accounts.length === 0}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "Issuing…" : "Issue cheque"}</Button>
      </aside>
    </form>
  );
}
