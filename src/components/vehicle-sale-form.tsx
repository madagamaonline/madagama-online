"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banknote, Building2, CalendarClock, Check, Equal, Minus, Tractor } from "lucide-react";
import type { VehicleSaleType } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VehicleCombobox } from "@/components/vehicle-combobox";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatLKR, round2 } from "@/lib/utils";

export type VehicleSaleFormState = { error?: string; ok?: boolean };

export function VehicleSaleForm({
  action,
  vehicle,
  customers,
  employees,
}: {
  action: (previous: VehicleSaleFormState, data: FormData) => Promise<VehicleSaleFormState>;
  vehicle: {
    id: string;
    label: string;
    engineNumber: string;
    chassisNumber: string;
    supplierName: string;
    listPrice: number;
    supplierSettlementDue: number;
  };
  customers: { id: string; name: string; phone: string }[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [type, setType] = useState<VehicleSaleType>("CASH");
  const [customerId, setCustomerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [downPayment, setDownPayment] = useState(vehicle.listPrice);

  const economics = useMemo(() => {
    const gross = round2(vehicle.listPrice - vehicle.supplierSettlementDue);
    const customerPrice = round2(vehicle.listPrice - discount);
    const net = round2(gross - discount);
    return { gross, customerPrice, net };
  }, [discount, vehicle.listPrice, vehicle.supplierSettlementDue]);

  const methods: { value: VehicleSaleType; label: string; hint: string; icon: React.ElementType }[] = [
    { value: "CASH", label: "Cash sale", hint: "Customer pays the full vehicle price", icon: Banknote },
    { value: "EXTERNAL_FINANCE", label: "Lease / finance", hint: "Record only the down payment collected here", icon: Building2 },
    { value: "IN_HOUSE_CREDIT", label: "In-house credit", hint: "Collect customer installments in this system", icon: CalendarClock },
  ];

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <input type="hidden" name="vehicleId" value={vehicle.id} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="soldByEmployeeId" value={employeeId} />

      <div className="space-y-4">
        <div aria-live="polite">{state.error ? <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">{state.error}</div> : null}</div>

        <Card className="overflow-hidden">
          <div className="border-b border-border-subtle bg-input/50 px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Tractor className="h-4 w-4 text-primary" />{vehicle.label}</div>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span>Engine <b className="font-mono text-foreground">{vehicle.engineNumber}</b></span><span>Chassis <b className="font-mono text-foreground">{vehicle.chassisNumber}</b></span></div>
          </div>
          <CardContent className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-foreground">How is the customer buying?</legend>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {methods.map((method) => {
                  const Icon = method.icon;
                  const selected = type === method.value;
                  return <button key={method.value} type="button" onClick={() => { setType(method.value); setDownPayment(method.value === "CASH" ? economics.customerPrice : 0); }} className={cn("relative rounded-xl border p-3 text-left outline-none transition focus:ring-2 focus:ring-primary/20", selected ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-input")} aria-pressed={selected}><div className="flex items-center gap-2 text-sm font-bold"><Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted")} />{method.label}{selected ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}</div><p className="mt-1 text-xs leading-4 text-muted">{method.hint}</p></button>;
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><VehicleCombobox id="customerId-combobox" label="Customer" options={customers.map((c) => ({ value: c.id, label: c.name, hint: c.phone }))} value={customerId} onChange={setCustomerId} placeholder="Search customer…" /><Link href="/customers/new" className="mt-1 inline-block text-xs text-primary hover:underline">+ Add customer record</Link></div>
              <div><VehicleCombobox id="soldBy-combobox" label="Salesperson" options={employees.map((e) => ({ value: e.id, label: e.name }))} value={employeeId} onChange={setEmployeeId} placeholder="Select salesperson…" /></div>
              <div><Label htmlFor="saleDate">Sale date</Label><Input id="saleDate" name="saleDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div>
              <div><Label htmlFor="customerDiscount">Customer discount (LKR)</Label><NumberInput id="customerDiscount" name="customerDiscount" min={0} max={economics.gross} value={discount} onValueChange={(v) => { const next = Number(v) || 0; setDiscount(next); if (type === "CASH") setDownPayment(round2(vehicle.listPrice - next)); }} /></div>
            </div>

            <div className="border-t border-border-subtle pt-5">
              <h3 className="mb-3 text-sm font-bold text-foreground">Payment received today</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div><Label htmlFor="downPayment">Amount (LKR)</Label><NumberInput id="downPayment" name="downPayment" min={0} value={downPayment} onValueChange={(value) => setDownPayment(Number(value) || 0)} readOnly={type === "CASH"} required={type !== "IN_HOUSE_CREDIT"} /></div>
                <div><Label htmlFor="paymentMethod">Method</Label><Select id="paymentMethod" name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="CARD">Card</option></Select></div>
                <div><Label htmlFor="paymentReference">Payment reference</Label><Input id="paymentReference" name="paymentReference" className="font-mono" placeholder="Optional" /></div>
              </div>
              {type === "EXTERNAL_FINANCE" ? <p className="mt-2 rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink">Only the down payment received by Madagama will be receipted. Finance installments are not collected here.</p> : null}
            </div>

            {type === "EXTERNAL_FINANCE" ? (
              <section className="border-t border-border-subtle pt-5">
                <h3 className="mb-3 text-sm font-bold">External finance details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><Label htmlFor="financeProvider">Finance provider</Label><Input id="financeProvider" name="financeProvider" required /></div><div><Label htmlFor="financeReference">Approval / lease reference</Label><Input id="financeReference" name="financeReference" className="font-mono" required /></div><div><Label htmlFor="financeApprovedAmount">Approved amount (LKR)</Label><NumberInput id="financeApprovedAmount" name="financeApprovedAmount" min={0} required /></div><div><Label htmlFor="financeApprovedAt">Approval date</Label><Input id="financeApprovedAt" name="financeApprovedAt" type="date" /></div></div>
              </section>
            ) : null}

            {type === "IN_HOUSE_CREDIT" ? (
              <section className="border-t border-border-subtle pt-5">
                <h3 className="mb-3 text-sm font-bold">Credit agreement</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><Label htmlFor="firstDueDate">First installment due</Label><Input id="firstDueDate" name="firstDueDate" type="date" required /></div><div><Label htmlFor="termMonths">Term (months)</Label><Input id="termMonths" name="termMonths" type="number" min="1" required /></div><div><Label htmlFor="expectedInstallment">Expected installment (LKR)</Label><NumberInput id="expectedInstallment" name="expectedInstallment" min={0} required /></div><div><Label htmlFor="interestRatePerMonth">Monthly interest (%)</Label><NumberInput id="interestRatePerMonth" name="interestRatePerMonth" min={0} defaultValue={0} /></div><div><Label htmlFor="interestFreeMonths">Interest-free months</Label><Input id="interestFreeMonths" name="interestFreeMonths" type="number" min="0" defaultValue="0" /></div></div>
                <h4 className="mb-3 mt-5 text-xs font-bold uppercase tracking-wide text-muted">Guarantor</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div><Label htmlFor="guarantorName">Full name</Label><Input id="guarantorName" name="guarantorName" required /></div><div><Label htmlFor="guarantorNic">NIC</Label><Input id="guarantorNic" name="guarantorNic" className="font-mono uppercase" required /></div><div><Label htmlFor="guarantorPhone">Phone</Label><Input id="guarantorPhone" name="guarantorPhone" inputMode="tel" required /></div></div>
              </section>
            ) : null}

            <div><Label htmlFor="notes">Sale notes</Label><Textarea id="notes" name="notes" rows={3} placeholder="Optional internal note…" /></div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="submit" disabled={pending || !customerId}>{pending ? "Confirming sale…" : "Confirm vehicle sale"}</Button></div>
      </div>

      <aside className="xl:sticky xl:top-4 xl:self-start">
        <Card className="overflow-hidden border-primary/30">
          <CardHeader className="bg-primary-soft"><CardTitle>Deal split</CardTitle><p className="mt-0.5 text-xs text-primary-ink">The customer discount comes entirely from dealer commission.</p></CardHeader>
          <CardContent className="space-y-3 tabular-nums">
            <DealRow label="Vehicle list price" value={vehicle.listPrice} />
            <DealRow label="Supplier amount" value={vehicle.supplierSettlementDue} subdued />
            <DealRow label="Gross commission" value={economics.gross} />
            <div className="flex items-center gap-2 border-y border-border-subtle py-3 text-clay-ink"><Minus className="h-4 w-4" /><span className="flex-1 text-sm">Customer discount</span><strong>{formatLKR(discount)}</strong></div>
            <DealRow label="Net dealer commission" value={economics.net} emphasized danger={economics.net < 0} />
            <div className="mt-4 rounded-xl bg-foreground p-4 text-white"><div className="text-xs text-white/70">Customer price</div><div className="mt-1 text-xl font-extrabold tracking-tight">{formatLKR(economics.customerPrice)}</div></div>
            <div className="flex items-center gap-2 pt-1 text-xs text-muted"><span>Supplier amount</span><span>+</span><span>Net commission</span><Equal className="ml-auto h-3.5 w-3.5" /><span className="font-semibold text-foreground">Customer price</span></div>
            <p className="border-t border-border-subtle pt-3 text-xs text-muted">Supplier: {vehicle.supplierName}. Amount becomes payable only when this sale is confirmed.</p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function DealRow({ label, value, subdued, emphasized, danger }: { label: string; value: number; subdued?: boolean; emphasized?: boolean; danger?: boolean }) {
  return <div className={cn("flex items-center justify-between gap-3 text-sm", subdued && "text-muted", emphasized && "font-bold", danger && "text-danger-ink")}><span>{label}</span><span>{formatLKR(value)}</span></div>;
}
