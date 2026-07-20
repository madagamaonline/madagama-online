import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { formatDate, formatLKR } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default async function VehiclePaymentReceiptPage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  const [payment, setting] = await Promise.all([prisma.vehicleCustomerPayment.findFirst({ where: { id: paymentId, saleId: id }, include: { sale: { include: { customer: { select: { name: true, phone: true } } } }, recordedBy: { select: { name: true } } } }), prisma.setting.findUnique({ where: { id: 1 } })]);
  if (!payment) notFound();
  return <div className="mx-auto max-w-2xl"><div className="no-print mb-4 flex items-center justify-between"><Link href={`/vehicle-sales/${id}`}><Button variant="outline"><ArrowLeft className="h-4 w-4" />Sale</Button></Link><PrintButton label="Print receipt" /></div><article className="print-area rounded-xl border border-border bg-surface p-8 shadow-sm"><header className="flex items-start justify-between border-b border-border pb-5"><div><h1 className="text-2xl font-extrabold">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1><p className="text-sm text-muted">{setting?.address}</p></div><div className="text-right"><h2 className="text-lg font-bold">VEHICLE PAYMENT RECEIPT</h2><p className="font-mono">VREC-{String(payment.receiptNumber).padStart(6, "0")}</p></div></header><div className="grid grid-cols-2 gap-5 py-6 text-sm"><div><p className="text-xs uppercase text-muted">Received from</p><p className="font-bold">{payment.sale.customer.name}</p><p className="text-muted">{payment.sale.customer.phone}</p></div><div className="text-right"><p className="text-xs uppercase text-muted">For vehicle</p><p className="font-bold">{payment.sale.vehicleLabelSnapshot}</p><p className="font-mono text-xs">{payment.sale.engineNumberSnapshot}</p></div></div><div className="border-y border-border py-7 text-center"><p className="text-sm text-muted">Amount received</p><p className="mt-2 text-3xl font-black tabular-nums">{formatLKR(payment.amount)}</p><p className="mt-2 text-sm">{payment.kind.replaceAll("_", " ")} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</p><p className="mt-1 text-sm text-muted">{formatDate(payment.paidDate)}</p></div><footer className="mt-16 grid grid-cols-2 gap-12 text-center text-xs"><div className="border-t border-border pt-2">Customer signature</div><div className="border-t border-border pt-2">Received by {payment.recordedBy?.name ?? "Madagama"}</div></footer></article></div>;
}
