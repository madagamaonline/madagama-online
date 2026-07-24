import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { formatDate, formatLKR, toNum } from "@/lib/utils";
import { layawayBalance } from "@/lib/layaway";
export const dynamic = "force-dynamic";
export default async function LayawayReceiptPage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  const [payment, setting] = await Promise.all([
    prisma.layawayPayment.findFirst({ where: { id: paymentId, orderId: id }, include: { recordedBy: { select: { name: true } }, order: { include: { customer: { select: { name: true, phone: true, address: true } }, items: true, payments: { orderBy: [{ paidDate: "asc" }, { createdAt: "asc" }] } } } } }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);
  if (!payment) notFound();
  const paymentIndex = payment.order.payments.findIndex((item)=>item.id===payment.id);
  const collectedAtReceipt = payment.order.payments.slice(0,paymentIndex+1).reduce((sum,item)=>sum+toNum(item.amount),0);
  const balance = layawayBalance(toNum(payment.order.total), collectedAtReceipt);
  return <div className="mx-auto max-w-2xl"><div className="no-print mb-4 flex items-center justify-between"><Link href={`/layaways/${id}`}><Button variant="outline"><ArrowLeft className="h-4 w-4"/>Layaway</Button></Link><PrintButton label="Print receipt"/></div>
    <article className="layaway-receipt-print print-area rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8"><header className="flex items-start justify-between gap-4 border-b border-border pb-5"><div><h1 className="text-xl font-extrabold sm:text-2xl">{setting?.businessName??"Madagama Pvt Ltd"}</h1><p className="text-sm text-muted">{setting?.address}</p><p className="text-sm text-muted">{setting?.phone}</p></div><div className="text-right"><h2 className="text-sm font-bold sm:text-lg">LAYAWAY RECEIPT</h2><p className="font-mono text-sm">LREC-{String(payment.receiptNumber).padStart(6,"0")}</p><p className="mt-1 font-mono text-xs text-muted">LAY-{String(payment.order.orderNumber).padStart(6,"0")}</p></div></header>
      <div className="grid grid-cols-2 gap-5 py-5 text-sm"><div><p className="text-xs uppercase text-muted">Received from</p><p className="font-bold">{payment.order.customer.name}</p><p className="text-muted">{payment.order.customer.phone}</p></div><div className="text-right"><p className="text-xs uppercase text-muted">Payment date</p><p className="font-bold">{formatDate(payment.paidDate)}</p><p className="text-muted">{payment.method}{payment.reference?` · ${payment.reference}`:""}</p></div></div>
      <div className="border-y border-border py-6 text-center"><p className="text-sm text-muted">Installment received</p><p className="mt-2 text-3xl font-black tabular-nums">{formatLKR(payment.amount)}</p></div>
      <div className="grid grid-cols-2 gap-3 border-b border-border py-4 text-center sm:grid-cols-3"><div className="col-span-2 border-b border-border-subtle pb-3 sm:col-span-1 sm:border-0 sm:pb-0"><p className="text-[10px] uppercase text-muted">Order total</p><p className="font-mono font-bold">{formatLKR(payment.order.total)}</p></div><div><p className="text-[10px] uppercase text-muted">Collected</p><p className="font-mono font-bold">{formatLKR(collectedAtReceipt)}</p></div><div><p className="text-[10px] uppercase text-muted">Balance</p><p className="font-mono font-bold">{formatLKR(balance)}</p></div></div>
      <div className="py-4"><p className="mb-2 text-xs font-bold uppercase text-muted">Reserved item summary</p>{payment.order.items.map((item)=><div key={item.id} className="flex justify-between gap-3 py-1 text-sm"><span>{item.qty} × {item.nameSnapshot}</span><span className="font-mono">{formatLKR(item.lineTotal)}</span></div>)}<p className="receipt-note mt-3 rounded-lg bg-input p-2 text-xs text-muted">Goods remain the property of the shop and stay in-store until full payment and explicit handover.</p></div>
      <footer className="mt-14 grid grid-cols-2 gap-12 text-center text-xs"><div className="border-t border-border pt-2">Customer signature</div><div className="border-t border-border pt-2">Received by {payment.recordedBy?.name??"Madagama"}</div></footer>
    </article>
  </div>;
}
