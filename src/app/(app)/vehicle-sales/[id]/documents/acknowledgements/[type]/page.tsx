/* eslint-disable @next/next/no-img-element -- private authenticated signature image */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { VehicleAcknowledgementType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { formatVehicleSaleNumber } from "@/lib/vehicle-sales";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";

type ManifestItem = { id: string; name: string; status: string; required: boolean; reference?: string; fileKey?: string };
const TYPES = ["CUSTOMER_DOCUMENTS_RECEIVED", "REGISTRATION_DOCUMENTS_HANDED_OVER"] as const;

export const dynamic = "force-dynamic";

export default async function VehicleAcknowledgementPrintPage({ params }: { params: Promise<{ id: string; type: string }> }) {
  await requireUser();
  const { id, type } = await params;
  if (!TYPES.includes(type as (typeof TYPES)[number])) notFound();
  const [acknowledgement, setting] = await Promise.all([
    prisma.vehicleDocumentAcknowledgement.findFirst({
      where: { type: type as VehicleAcknowledgementType, case: { saleId: id } },
      include: {
        witnessedBy: { select: { name: true } },
        case: { include: { sale: { include: { customer: true } } } },
      },
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);
  if (!acknowledgement) notFound();
  const sale = acknowledgement.case.sale;
  const manifest = Array.isArray(acknowledgement.documentManifest)
    ? acknowledgement.documentManifest as ManifestItem[]
    : [];
  const title = acknowledgement.type === "CUSTOMER_DOCUMENTS_RECEIVED"
    ? "CUSTOMER DOCUMENTS RECEIVED"
    : "REGISTRATION DOCUMENTS HANDED OVER";

  return <div className="mx-auto max-w-3xl">
    <div className="no-print mb-4 flex justify-between"><Link href={`/vehicle-sales/${id}/documents`}><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Back</Button></Link><PrintButton label="Print / Save PDF" /></div>
    <article className="print-area print-a4 min-h-[900px] rounded-xl border border-border bg-white p-8 text-slate-950 shadow-sm">
      <header className="flex justify-between gap-6 border-b-2 border-slate-800 pb-5"><div><h1 className="text-2xl font-black">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1><p className="text-sm text-slate-600">{setting?.address}</p><p className="text-sm text-slate-600">{setting?.phone}</p></div><div className="text-right"><h2 className="max-w-sm text-lg font-black">{title}</h2><p className="font-mono">{formatVehicleSaleNumber(sale.saleNumber)}</p><p className="text-sm">{formatDateTime(acknowledgement.signedAt)}</p></div></header>
      <section className="grid grid-cols-2 gap-8 border-b border-slate-300 py-5 text-sm"><div><p className="text-xs font-bold uppercase text-slate-500">Customer</p><p className="mt-1 font-bold">{acknowledgement.signerName}</p><p>NIC: {acknowledgement.signerNic}</p><p>{sale.customer.phone}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Vehicle</p><p className="mt-1 font-bold">{sale.vehicleLabelSnapshot}</p><p className="font-mono text-xs">Engine: {sale.engineNumberSnapshot}</p><p className="font-mono text-xs">Chassis: {sale.chassisNumberSnapshot}</p>{acknowledgement.case.registrationNumber && <p>Registration: {acknowledgement.case.registrationNumber}</p>}</div></section>
      <p className="my-5 text-sm font-medium leading-relaxed">{acknowledgement.acknowledgementText}</p>
      <table className="w-full border-collapse text-sm"><thead><tr className="border-y-2 border-slate-800 text-left"><th className="py-2">Document</th><th>Status</th><th>Reference</th></tr></thead><tbody>{manifest.map((item) => <tr key={item.id} className="border-b border-slate-300"><td className="py-2">{item.name}{item.required ? " *" : ""}</td><td>{item.status.replaceAll("_", " ")}</td><td>{item.reference || "—"}</td></tr>)}</tbody></table>
      <section className="mt-10 grid grid-cols-2 gap-12 text-sm"><div><p className="text-xs font-bold uppercase text-slate-500">Customer signature</p><img src={`/api/files/${acknowledgement.signatureKey}`} alt="Customer signature" className="mt-2 h-28 max-w-full object-contain object-left" /><p className="mt-1 font-bold">{acknowledgement.signerName}</p><p>{formatDateTime(acknowledgement.signedAt)}</p></div><div className="flex flex-col justify-end"><div className="border-t border-slate-700 pt-2">Witnessed by {acknowledgement.witnessedBy?.name ?? "Madagama staff"}</div></div></section>
      <footer className="mt-10 break-all border-t border-slate-300 pt-3 text-[9px] text-slate-500">Evidence manifest SHA-256: {acknowledgement.manifestHash}</footer>
    </article>
  </div>;
}
