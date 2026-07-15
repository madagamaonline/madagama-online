"use client";

import { useRef, useState } from "react";
import { Eraser, ShieldCheck } from "lucide-react";
import { InvoicePrintControls } from "@/components/invoice-print-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLKR } from "@/lib/utils";

type ReceiptDraft = {
  customerName: string;
  date: string;
  lolcCode: string;
  amount: string;
  phone: string;
  note: string;
};

function emptyDraft(date: string): ReceiptDraft {
  return {
    customerName: "",
    date,
    lolcCode: "",
    amount: "",
    phone: "",
    note: "",
  };
}

function displayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function LolcInstallmentReceipt({
  businessName,
  businessPhone,
  businessAddress,
  initialDate,
}: {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  initialDate: string;
}) {
  const [draft, setDraft] = useState<ReceiptDraft>(() => emptyDraft(initialDate));
  const formRef = useRef<HTMLFormElement>(null);

  function update(field: keyof ReceiptDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function clearDraft() {
    setDraft(emptyDraft(initialDate));
  }

  return (
    <div className="space-y-6">
      <Card className="no-print">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Payment details</CardTitle>
            <p className="mt-1 text-xs text-muted">Fill the receipt, print it, and the details will be cleared automatically.</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success-ink">
            <ShieldCheck className="h-4 w-4" /> Not saved
          </div>
        </CardHeader>
        <CardContent>
          <form ref={formRef} autoComplete="off" onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Label htmlFor="lolc-customer-name">Customer name</Label>
                <Input
                  id="lolc-customer-name"
                  value={draft.customerName}
                  onChange={(event) => update("customerName", event.target.value)}
                  placeholder="Customer's full name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="lolc-date">Payment date</Label>
                <Input
                  id="lolc-date"
                  type="date"
                  value={draft.date}
                  onChange={(event) => update("date", event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lolc-code">LOLC code</Label>
                <Input
                  id="lolc-code"
                  value={draft.lolcCode}
                  onChange={(event) => update("lolcCode", event.target.value)}
                  placeholder="Agreement / payment code"
                  required
                />
              </div>
              <div>
                <Label htmlFor="lolc-phone">Phone number</Label>
                <Input
                  id="lolc-phone"
                  type="tel"
                  inputMode="tel"
                  value={draft.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  placeholder="e.g. 0771234567"
                  required
                />
              </div>
              <div>
                <Label htmlFor="lolc-amount">Amount paid (LKR)</Label>
                <Input
                  id="lolc-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={draft.amount}
                  onChange={(event) => update("amount", event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor="lolc-note">Note (optional)</Label>
                <Textarea
                  id="lolc-note"
                  value={draft.note}
                  onChange={(event) => update("note", event.target.value)}
                  placeholder="Any additional payment information"
                  maxLength={500}
                  className="min-h-24"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={clearDraft}>
                <Eraser className="h-4 w-4" /> Clear
              </Button>
              <InvoicePrintControls
                label="Print & Clear"
                onBeforePrint={() => formRef.current?.reportValidity() ?? false}
                onAfterPrint={clearDraft}
              />
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="no-print flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Receipt preview</h2>
          <p className="text-xs text-muted">Only the white receipt below will print.</p>
        </div>
      </div>

      <div className="a4-preview-viewport max-w-full overflow-x-auto pb-2">
        <article className="print-area print-a4 mx-auto min-h-[680px] w-[720px] min-w-[720px] rounded-xl border border-border bg-white p-10 text-slate-950 shadow-sm sm:w-full">
          <header className="flex items-start justify-between gap-6 border-b border-slate-300 pb-6">
            <div>
              <h1 className="text-[26px] font-bold leading-tight">{businessName}</h1>
              {businessAddress && <p className="mt-1 text-[15px] text-slate-600">{businessAddress}</p>}
              {businessPhone && <p className="text-[15px] text-slate-600">Tel: {businessPhone}</p>}
            </div>
            <div className="max-w-[300px] text-right">
              <h2 className="text-[22px] font-bold leading-tight">LOLC INSTALLMENT RECEIPT</h2>
              <p className="mt-1 text-[14px] font-medium text-slate-600">Payment collected on behalf of LOLC Finance</p>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-x-10 gap-y-6 py-8 text-[16px]">
            <div>
              <p className="text-sm font-medium text-slate-500">Customer Name</p>
              <p className="mt-1 min-h-6 font-semibold">{draft.customerName || "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-500">Date</p>
              <p className="mt-1 min-h-6 font-semibold">{displayDate(draft.date)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Phone Number</p>
              <p className="mt-1 min-h-6 font-semibold">{draft.phone || "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-500">LOLC Code</p>
              <p className="mt-1 min-h-6 break-all font-mono font-semibold">{draft.lolcCode || "—"}</p>
            </div>
          </section>

          <section className="rounded-lg border-2 border-slate-400 px-6 py-5">
            <div className="flex items-center justify-between gap-5">
              <p className="text-[17px] font-semibold uppercase tracking-wide text-slate-600">Amount Paid</p>
              <p className="tabular text-[28px] font-bold">{draft.amount ? formatLKR(draft.amount) : "LKR 0.00"}</p>
            </div>
          </section>

          <section className="mt-8 min-h-28 border-t border-slate-300 pt-5">
            <p className="text-sm font-medium text-slate-500">Note</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6">{draft.note || "—"}</p>
          </section>

          <footer className="mt-12 border-t border-slate-300 pt-5 text-center text-[13px] leading-5 text-slate-600">
            <p>This receipt acknowledges collection of the installment payment shown above on behalf of LOLC Finance.</p>
            <p className="mt-1">This is not a sale invoice and does not form part of {businessName}&apos;s sales or accounts.</p>
          </footer>
        </article>
      </div>

      {/* 80mm thermal layout. The shared print controls show this preview and
          print it from an isolated, receipt-sized document when selected. */}
      <article className="print-area print-thermal mx-auto w-[302px] bg-white px-3 py-4 font-sans text-[14px] font-normal leading-[1.3] text-black shadow-sm">
        <header className="text-center">
          <p className="text-[18px] font-semibold uppercase leading-tight">{businessName}</p>
          {businessAddress && <p className="mt-0.5 break-words">{businessAddress}</p>}
          {businessPhone && <p>Tel: {businessPhone}</p>}
        </header>

        <div className="my-2 border-t border-dashed border-black" />

        <p className="text-center text-[15px] font-bold">LOLC INSTALLMENT RECEIPT</p>
        <p className="mt-0.5 text-center text-[12px]">Collected on behalf of LOLC Finance</p>

        <div className="my-2 border-t border-dashed border-black" />

        <dl className="space-y-1.5">
          <div>
            <dt className="text-[12px]">CUSTOMER</dt>
            <dd className="break-words font-semibold">{draft.customerName || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>DATE</dt>
            <dd className="text-right font-semibold">{displayDate(draft.date)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>PHONE</dt>
            <dd className="text-right font-semibold">{draft.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px]">LOLC CODE</dt>
            <dd className="break-all font-mono font-semibold">{draft.lolcCode || "—"}</dd>
          </div>
        </dl>

        <div className="my-2 border-t border-dashed border-black" />

        <div className="flex items-end justify-between gap-2 text-[16px] font-bold">
          <span>AMOUNT PAID</span>
          <span className="shrink-0 tabular">{draft.amount ? formatLKR(draft.amount) : "LKR 0.00"}</span>
        </div>

        {draft.note && (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <p className="text-[12px]">NOTE</p>
            <p className="whitespace-pre-wrap break-words">{draft.note}</p>
          </>
        )}

        <div className="my-2 border-t border-dashed border-black" />

        <footer className="text-center text-[11px] leading-[1.35]">
          <p>This receipt acknowledges collection on behalf of LOLC Finance.</p>
          <p className="mt-1">Not a sale invoice or part of {businessName}&apos;s sales or accounts.</p>
        </footer>
      </article>
    </div>
  );
}
