"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, CircleDashed, FileCheck2, FilePlus2, Upload, Loader2, ExternalLink, LockKeyhole } from "lucide-react";
import type { VehicleDocumentCaseStatus, VehicleDocumentItemStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/signature-pad";
import type { VehicleActionState } from "@/components/vehicle-payment-form";
import { cn, formatDateTime } from "@/lib/utils";

type ServerAction = (previous: VehicleActionState, data: FormData) => Promise<VehicleActionState>;
type Item = { id: string; name: string; status: VehicleDocumentItemStatus; required: boolean; fileKey: string | null; reference: string | null };
type Acknowledgement = { id: string; type: "CUSTOMER_DOCUMENTS_RECEIVED" | "REGISTRATION_DOCUMENTS_HANDED_OVER"; signerName: string; signerNic: string; signatureKey: string; signedAt: Date | string; witnessedByName?: string | null };

const caseSteps: { value: VehicleDocumentCaseStatus; label: string }[] = [
  { value: "AWAITING_CUSTOMER_DOCUMENTS", label: "Awaiting customer documents" },
  { value: "DOCUMENTS_RECEIVED", label: "Documents received" },
  { value: "SUBMITTED", label: "Submitted for registration" },
  { value: "PROCESSING", label: "Processing" },
  { value: "REGISTERED", label: "Registration completed" },
  { value: "HANDED_OVER", label: "Handed over" },
];

const itemStatuses: VehicleDocumentItemStatus[] = ["REQUIRED", "RECEIVED", "SUBMITTED", "APPROVED", "RETURNED", "WAIVED"];

export function VehicleDocumentWorkflow({ caseRecord, addItemAction, updateItemActions, updateCaseAction, receiveAcknowledgementAction, handoverAcknowledgementAction, canUpdateProcessing = true }: {
  caseRecord: { id: string; status: VehicleDocumentCaseStatus; registrationNumber: string | null; processingReference: string | null; notes: string | null; items: Item[]; acknowledgements: Acknowledgement[] };
  addItemAction: ServerAction;
  updateItemActions: Record<string, ServerAction>;
  updateCaseAction: ServerAction;
  receiveAcknowledgementAction: ServerAction;
  handoverAcknowledgementAction: ServerAction;
  canUpdateProcessing?: boolean;
}) {
  const activeIndex = Math.max(0, caseSteps.findIndex((s) => s.value === caseRecord.status));
  const receivedAck = caseRecord.acknowledgements.find((a) => a.type === "CUSTOMER_DOCUMENTS_RECEIVED");
  const handoverAck = caseRecord.acknowledgements.find((a) => a.type === "REGISTRATION_DOCUMENTS_HANDED_OVER");
  const allRequiredReceived = caseRecord.items.filter((i) => i.required).every((i) => i.status !== "REQUIRED");

  let nextAction = "Collect the required customer documents.";
  if (allRequiredReceived && !receivedAck) nextAction = "Capture the customer’s documents-received signature.";
  else if (receivedAck && activeIndex < 2) nextAction = "Submit the document pack for registration.";
  else if (activeIndex >= 2 && activeIndex < 4) nextAction = "Update the case as registration progresses.";
  else if (activeIndex >= 4 && !handoverAck) nextAction = "Hand over the completed registration documents and capture the customer’s signature.";
  else if (handoverAck) nextAction = "Document processing is complete.";

  return <div className="space-y-4">
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", handoverAck ? "border-primary/30 bg-primary-soft" : "border-clay/30 bg-clay-soft")}><div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", handoverAck ? "bg-primary text-white" : "bg-clay text-white")}>{handoverAck ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}</div><div><p className="text-xs font-bold uppercase tracking-wide opacity-70">Required next action</p><p className="mt-0.5 text-sm font-semibold">{nextAction}</p></div></div>

    <Card><CardHeader><CardTitle>Registration progress</CardTitle></CardHeader><CardContent><ol className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">{caseSteps.map((step, index) => <li key={step.value} className={cn("relative rounded-lg border px-3 py-2 text-xs", index < activeIndex ? "border-primary/20 bg-primary-soft text-primary-ink" : index === activeIndex ? "border-primary bg-surface font-bold text-primary-ink" : "border-border-subtle bg-input/40 text-muted")}><span className="mb-1 block font-mono text-[10px] opacity-60">{String(index + 1).padStart(2, "0")}</span>{step.label}</li>)}</ol></CardContent></Card>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <Card><CardHeader className="flex items-center justify-between gap-3"><CardTitle>Document checklist</CardTitle><Badge tone={allRequiredReceived ? "green" : "amber"}>{caseRecord.items.filter((i) => i.required && i.status === "REQUIRED").length} outstanding</Badge></CardHeader><CardContent className="p-0">
          {caseRecord.items.length === 0 ? <div className="px-5 py-10 text-center text-sm text-muted"><FileCheck2 className="mx-auto mb-2 h-8 w-8 text-faint" />No document requirements added yet.</div> : <div className="divide-y divide-border-subtle">{caseRecord.items.map((item) => <DocumentItemRow key={item.id} item={item} action={updateItemActions[item.id]} canUpdateProcessing={canUpdateProcessing} />)}</div>}
          <AddDocumentItem action={addItemAction} />
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Signed acknowledgements</CardTitle></CardHeader><CardContent className="space-y-5">
          <AcknowledgementCheckpoint title="Customer documents received" description="Confirms exactly which original documents the customer handed to Madagama." acknowledgement={receivedAck} action={receiveAcknowledgementAction} enabled={allRequiredReceived} printHref={receivedAck ? `/vehicle-sales/documents/acknowledgements/${receivedAck.id}/print` : undefined} />
          <div className="border-t border-border-subtle" />
          <AcknowledgementCheckpoint title="Registration documents handed over" description="Confirms the completed registration documents were returned to the customer." acknowledgement={handoverAck} action={handoverAcknowledgementAction} enabled={activeIndex >= 4 && Boolean(receivedAck)} printHref={handoverAck ? `/vehicle-sales/documents/acknowledgements/${handoverAck.id}/print` : undefined} />
        </CardContent></Card>
      </div>

      {canUpdateProcessing ? <CaseUpdate action={updateCaseAction} current={caseRecord} /> : null}
    </div>
  </div>;
}

function DocumentItemRow({ item, action, canUpdateProcessing }: { item: Item; action: ServerAction; canUpdateProcessing: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [fileKey, setFileKey] = useState(item.fileKey ?? "");
  const [uploading, setUploading] = useState(false);
  const tone = item.status === "APPROVED" ? "green" : item.status === "RECEIVED" || item.status === "SUBMITTED" ? "blue" : item.status === "RETURNED" ? "red" : "amber";
  async function upload(file: File) { setUploading(true); try { const data = new FormData(); data.append("file", file); data.append("folder", "vehicle-documents"); const response = await fetch("/api/upload", { method: "POST", body: data }); const body = await response.json(); if (response.ok) setFileKey(body.key); } finally { setUploading(false); } }
  const availableStatuses = canUpdateProcessing ? itemStatuses : itemStatuses.filter((status) => ["REQUIRED", "RECEIVED"].includes(status));
  return <form action={formAction} className="p-4"><input type="hidden" name="name" value={item.name} /><input type="hidden" name="required" value={String(item.required)} /><input type="hidden" name="fileKey" value={fileKey} /><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{item.name}</span>{item.required ? <Badge tone="gray">Required</Badge> : null}<Badge tone={tone}>{item.status.replaceAll("_", " ")}</Badge></div>{state.error ? <p className="mt-1 text-xs text-danger-ink">{state.error}</p> : null}{fileKey ? <a className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/api/files/${fileKey}`} target="_blank" rel="noreferrer">View uploaded file <ExternalLink className="h-3 w-3" /></a> : null}</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_10rem_auto]"><Select name="status" defaultValue={item.status}>{availableStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</Select><Input name="reference" defaultValue={item.reference ?? ""} placeholder="Reference" /><div className="flex gap-2"><label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-input-border bg-input px-3 text-sm font-semibold hover:bg-border-subtle">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}<span className="sr-only sm:not-sr-only">Upload</span><input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} /></label><Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div></div></div></form>;
}

function AddDocumentItem({ action }: { action: ServerAction }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="border-t border-border-subtle bg-input/30 p-4"><div className="flex flex-col gap-2 sm:flex-row"><div className="min-w-0 flex-1"><Label htmlFor="new-document-name">Add checklist item</Label><Input id="new-document-name" name="name" placeholder="e.g. Customer NIC copy" required /></div><label className="mt-1 flex items-center gap-2 self-start text-sm sm:mt-8"><input type="checkbox" name="required" defaultChecked className="h-4 w-4" />Required</label><Button className="sm:mt-7" type="submit" variant="outline" disabled={pending}><FilePlus2 className="h-4 w-4" />{pending ? "Adding…" : "Add"}</Button></div>{state.error ? <p className="mt-1 text-xs text-danger-ink">{state.error}</p> : null}</form>;
}

function CaseUpdate({ action, current }: { action: ServerAction; current: { status: VehicleDocumentCaseStatus; registrationNumber: string | null; processingReference: string | null; notes: string | null } }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <Card className="h-fit xl:sticky xl:top-4"><CardHeader><CardTitle>Case details</CardTitle></CardHeader><CardContent><form action={formAction} className="space-y-3"><div aria-live="polite">{state.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p> : null}{state.ok ? <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">Case updated.</p> : null}</div><div><Label htmlFor="case-status">Stage</Label><Select id="case-status" name="status" defaultValue={current.status}>{caseSteps.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}<option value="CANCELLED">Cancelled</option></Select></div><div><Label htmlFor="processingReference">Processing reference</Label><Input id="processingReference" name="processingReference" className="font-mono" defaultValue={current.processingReference ?? ""} /></div><div><Label htmlFor="registrationNumber">Registration number</Label><Input id="registrationNumber" name="registrationNumber" className="font-mono uppercase" defaultValue={current.registrationNumber ?? ""} /></div><div><Label htmlFor="case-notes">Internal notes</Label><Textarea id="case-notes" name="notes" rows={4} defaultValue={current.notes ?? ""} /></div><Button className="w-full" type="submit" disabled={pending}>{pending ? "Updating…" : "Update case"}</Button></form></CardContent></Card>;
}

function AcknowledgementCheckpoint({ title, description, acknowledgement, action, enabled, printHref }: { title: string; description: string; acknowledgement?: Acknowledgement; action: ServerAction; enabled: boolean; printHref?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState(false);
  if (acknowledgement) return <div className="rounded-xl border border-primary/20 bg-primary-soft p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-primary-ink">{title}</h3><Badge tone="green"><LockKeyhole className="mr-1 h-3 w-3" />Locked</Badge></div><p className="mt-1 text-xs text-muted">Signed by {acknowledgement.signerName} · NIC <span className="font-mono">{acknowledgement.signerNic}</span> · {formatDateTime(acknowledgement.signedAt)}</p></div>{printHref ? <a href={printHref} className="text-xs font-semibold text-primary hover:underline">Print</a> : null}</div></div>;
  return <section><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold">{title}</h3><p className="mt-0.5 text-xs text-muted">{description}</p></div><Button type="button" variant="outline" onClick={() => setOpen((v) => !v)} disabled={!enabled}>{open ? "Close" : "Capture signature"}</Button></div>{!enabled ? <p className="mt-2 text-xs text-clay-ink">Complete the preceding workflow step before signing.</p> : null}{open ? <form action={formAction} className="mt-4 space-y-4 rounded-xl border border-border bg-input/30 p-4"><div aria-live="polite">{state.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</p> : null}</div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><Label htmlFor={`${title}-name`}>Customer full name</Label><Input id={`${title}-name`} name="signerName" required /></div><div><Label htmlFor={`${title}-nic`}>Customer NIC</Label><Input id={`${title}-nic`} name="signerNic" className="font-mono uppercase" required /></div></div><SignaturePad name="signatureData" /><label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" name="confirmed" required className="mt-0.5 h-4 w-4 shrink-0" />I have verified the customer’s identity and the document checklist. This acknowledgement becomes permanent after signing.</label><Button type="submit" disabled={pending}>{pending ? "Capturing…" : "Capture permanent acknowledgement"}</Button></form> : null}</section>;
}
