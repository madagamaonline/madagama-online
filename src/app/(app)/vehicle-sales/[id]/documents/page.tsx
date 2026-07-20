import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VehicleDocumentWorkflow } from "@/components/vehicle-document-workflow";
import { addVehicleDocumentItem, captureVehicleAcknowledgement, updateVehicleDocumentCase, updateVehicleDocumentItem } from "../../actions";
import { formatDateTime } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { VehicleDossierMasthead } from "@/components/vehicle-dossier-masthead";

export const dynamic = "force-dynamic";
export default async function VehicleDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sale, session] = await Promise.all([prisma.vehicleSale.findUnique({ where: { id }, select: { id: true, saleNumber: true, vehicleLabelSnapshot: true, engineNumberSnapshot: true, chassisNumberSnapshot: true, customer: { select: { name: true } }, documentCase: { include: { items: { orderBy: { createdAt: "asc" } }, acknowledgements: { orderBy: { signedAt: "asc" }, include: { witnessedBy: { select: { name: true } } } }, events: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } } } } } }), getSession()]);
  if (!sale?.documentCase) notFound();
  const documentCase = sale.documentCase;
  const itemActions = Object.fromEntries(documentCase.items.map((item) => [item.id, updateVehicleDocumentItem.bind(null, item.id)]));
  return <div className="mx-auto max-w-6xl"><PageHeader title="Registration documents" subtitle={`VS-${String(sale.saleNumber).padStart(6, "0")} · ${sale.vehicleLabelSnapshot} · ${sale.customer.name}`} action={<Link href={`/vehicle-sales/${sale.id}`}><Button variant="outline"><ArrowLeft className="h-4 w-4" />Sale</Button></Link>} />
    <VehicleDossierMasthead label={sale.vehicleLabelSnapshot} status={documentCase.status} engineNumber={sale.engineNumberSnapshot} chassisNumber={sale.chassisNumberSnapshot} supplier={`Customer: ${sale.customer.name}`} compact />
    <VehicleDocumentWorkflow canUpdateProcessing={session?.role !== "SALESPERSON"} caseRecord={{ id: documentCase.id, status: documentCase.status, registrationNumber: documentCase.registrationNumber, processingReference: documentCase.processingReference, notes: documentCase.notes, items: documentCase.items.map((i) => ({ id: i.id, name: i.name, status: i.status, required: i.required, fileKey: i.fileKey, reference: i.reference })), acknowledgements: documentCase.acknowledgements.map((a) => ({ id: a.id, type: a.type, signerName: a.signerName, signerNic: a.signerNic, signatureKey: a.signatureKey, signedAt: a.signedAt, witnessedByName: a.witnessedBy?.name })) }} addItemAction={addVehicleDocumentItem.bind(null, documentCase.id)} updateItemActions={itemActions} updateCaseAction={updateVehicleDocumentCase.bind(null, documentCase.id)} receiveAcknowledgementAction={captureVehicleAcknowledgement.bind(null, documentCase.id, "CUSTOMER_DOCUMENTS_RECEIVED")} handoverAcknowledgementAction={captureVehicleAcknowledgement.bind(null, documentCase.id, "REGISTRATION_DOCUMENTS_HANDED_OVER")} />
    <Card className="mt-4"><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4 text-muted" />Append-only activity</CardTitle></CardHeader><CardContent>{documentCase.events.length === 0 ? <p className="text-sm text-muted">No activity recorded.</p> : <ol className="space-y-4">{documentCase.events.map((event) => <li key={event.id} className="flex gap-3"><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-medium">{event.type.replaceAll("_", " ")}{event.toStatus ? ` → ${event.toStatus.replaceAll("_", " ")}` : ""}</p>{event.note ? <p className="mt-0.5 text-sm text-muted">{event.note}</p> : null}<p className="mt-1 text-xs text-faint">{formatDateTime(event.createdAt)} · {event.createdBy?.name ?? "System"}</p></div></li>)}</ol>}</CardContent></Card>
  </div>;
}
