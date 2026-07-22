import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { InvoicePrintControls } from "@/components/invoice-print-controls";
import { lolcReceiptNumber } from "@/lib/lolc-receipts";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatDate, formatLKR } from "@/lib/utils";

export const dynamic = "force-dynamic";

function VoidMark({ reason }: { reason: string | null }) {
  return <div className="pointer-events-none absolute inset-0 z-10 flex rotate-[-24deg] items-center justify-center" aria-label="Voided receipt"><div className="border-[8px] border-red-600 px-8 py-3 text-[64px] font-black tracking-[0.18em] text-red-600 opacity-60">VOID</div>{reason && <span className="absolute mt-28 max-w-[420px] text-center text-sm font-bold text-red-700">{reason}</span>}</div>;
}

export default async function PrintLolcReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [receipt, settings] = await Promise.all([prisma.lolcReceipt.findUnique({ where: { id } }), getSettings()]);
  if (!receipt) notFound();
  const number = lolcReceiptNumber(receipt.receiptNumber);
  const businessName = settings?.businessName ?? "Madagama Pvt Ltd";
  const address = settings?.address ?? "";
  const phone = settings?.phone ?? "";
  const voided = receipt.status === "VOIDED";

  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="no-print flex flex-wrap items-center justify-between gap-3"><div><Link href={`/lolc-receipt/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Back to receipt</Link><h1 className="text-lg font-bold">Print {number}</h1><p className="text-xs text-muted">Permanent saved values · Operational tracking only</p></div><InvoicePrintControls label="Print receipt" /></div>
    {voided && <div className="no-print rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">This receipt is void. Every print carries a prominent VOID mark.</div>}

    <div className="a4-preview-viewport max-w-full overflow-x-auto pb-2">
      <article className="print-area print-a4 relative mx-auto min-h-[680px] w-[720px] min-w-[720px] overflow-hidden rounded-xl border border-border bg-white p-10 text-slate-950 shadow-sm sm:w-full">
        {voided && <VoidMark reason={receipt.voidReason} />}
        <header className="flex items-start justify-between gap-6 border-b border-slate-300 pb-6"><div><h2 className="text-[26px] font-bold leading-tight">{businessName}</h2>{address && <p className="mt-1 text-[15px] text-slate-600">{address}</p>}{phone && <p className="text-[15px] text-slate-600">Tel: {phone}</p>}</div><div className="max-w-[320px] text-right"><p className="text-[22px] font-bold leading-tight">LOLC INSTALLMENT RECEIPT</p><p className="mt-1 font-mono text-[14px] font-bold">{number}</p><p className="mt-1 text-[13px] text-slate-600">Collected on behalf of LOLC Finance</p></div></header>
        <section className="grid grid-cols-2 gap-x-10 gap-y-6 py-8 text-[16px]"><div><p className="text-sm font-medium text-slate-500">Customer Name</p><p className="mt-1 font-semibold">{receipt.customerName}</p></div><div className="text-right"><p className="text-sm font-medium text-slate-500">Date</p><p className="mt-1 font-semibold">{formatDate(receipt.collectedAt)}</p></div><div><p className="text-sm font-medium text-slate-500">Phone Number</p><p className="mt-1 font-semibold">{receipt.customerPhone}</p></div><div className="text-right"><p className="text-sm font-medium text-slate-500">LOLC Code</p><p className="mt-1 break-all font-mono font-semibold">{receipt.lolcCode}</p></div></section>
        <section className="rounded-lg border-2 border-slate-400 px-6 py-5"><div className="flex items-center justify-between gap-5"><p className="text-[17px] font-semibold uppercase tracking-wide text-slate-600">Amount Paid</p><p className="tabular text-[28px] font-bold">{formatLKR(receipt.amount)}</p></div></section>
        <section className="mt-8 min-h-28 border-t border-slate-300 pt-5"><p className="text-sm font-medium text-slate-500">Note</p><p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6">{receipt.note || "—"}</p></section>
        <footer className="mt-12 border-t border-slate-300 pt-5 text-center text-[13px] leading-5 text-slate-600"><p>This receipt acknowledges collection of the installment payment shown above on behalf of LOLC Finance.</p><p className="mt-1">This is not a sale invoice and does not form part of {businessName}&apos;s sales or accounts.</p></footer>
      </article>
    </div>

    <article className="print-area print-thermal relative mx-auto w-[302px] overflow-hidden bg-white px-3 py-4 font-sans text-[14px] font-normal leading-[1.3] text-black shadow-sm">
      {voided && <div className="pointer-events-none absolute inset-0 z-10 flex rotate-[-28deg] items-center justify-center"><span className="border-4 border-black px-2 text-[38px] font-black tracking-widest opacity-55">VOID</span></div>}
      <header className="text-center"><p className="text-[18px] font-semibold uppercase leading-tight">{businessName}</p>{address && <p className="mt-0.5 break-words">{address}</p>}{phone && <p>Tel: {phone}</p>}</header><div className="my-2 border-t border-dashed border-black" />
      <p className="text-center text-[15px] font-bold">LOLC INSTALLMENT RECEIPT</p><p className="text-center font-mono text-[13px] font-bold">{number}</p><p className="mt-0.5 text-center text-[12px]">Collected on behalf of LOLC Finance</p><div className="my-2 border-t border-dashed border-black" />
      <dl className="space-y-1.5"><div><dt className="text-[12px]">CUSTOMER</dt><dd className="break-words font-semibold">{receipt.customerName}</dd></div><div className="flex justify-between gap-3"><dt>DATE</dt><dd className="text-right font-semibold">{formatDate(receipt.collectedAt)}</dd></div><div className="flex justify-between gap-3"><dt>PHONE</dt><dd className="text-right font-semibold">{receipt.customerPhone}</dd></div><div><dt className="text-[12px]">LOLC CODE</dt><dd className="break-all font-mono font-semibold">{receipt.lolcCode}</dd></div></dl><div className="my-2 border-t border-dashed border-black" />
      <div className="flex items-end justify-between gap-2 text-[16px] font-bold"><span>AMOUNT PAID</span><span className="shrink-0 tabular">{formatLKR(receipt.amount)}</span></div>{receipt.note && <><div className="my-2 border-t border-dashed border-black" /><p className="text-[12px]">NOTE</p><p className="whitespace-pre-wrap break-words">{receipt.note}</p></>}<div className="my-2 border-t border-dashed border-black" />
      <footer className="text-center text-[11px] leading-[1.35]"><p>This receipt acknowledges collection on behalf of LOLC Finance.</p><p className="mt-1">Not a sale invoice or part of {businessName}&apos;s sales or accounts.</p>{voided && <p className="mt-2 font-black">VOID: {receipt.voidReason}</p>}</footer>
    </article>
  </div>;
}
