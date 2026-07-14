import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MessageSquare, Pencil, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requestNumber, requestStatusLabel, requestStatusTone, requestTypeLabel } from "@/lib/customer-requests";
import { formatDate, formatDateTime, formatLKR } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerRequestStatusForm } from "@/components/customer-request-status-form";
import { updateCustomerRequestStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function CustomerRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await prisma.customerRequest.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      product: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true } },
      assignedTo: { select: { name: true } },
      createdBy: { select: { name: true } },
      events: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
    },
  });
  if (!request) notFound();
  const contactName = request.customer?.name ?? request.contactName ?? "Walk-in customer";
  const contactPhone = request.customer?.phone ?? request.contactPhone;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={request.title} subtitle={`${requestNumber(request.requestNumber)} · ${requestTypeLabel(request.type)}`} action={
        <Link href={`/requests/${request.id}/edit`}><Button variant="outline"><Pencil className="h-4 w-4" /> Edit</Button></Link>
      } />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={requestStatusTone(request.status)}>{requestStatusLabel(request.status)}</Badge>
        <Badge tone={request.priority === "HIGH" ? "red" : "gray"}>{request.priority.toLowerCase()} priority</Badge>
        {request.followUpAt && <Badge tone="amber"><CalendarClock className="mr-1 h-3 w-3" /> Follow up {formatDate(request.followUpAt)}</Badge>}
        {request.remindBySms && <Badge tone="blue">Shop SMS enabled</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader><CardTitle>Request details</CardTitle></CardHeader><CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Quantity</dt><dd className="mt-1 font-medium">{request.quantity}</dd></div>
              <div><dt className="text-xs text-muted">Customer budget</dt><dd className="mt-1 font-medium">{request.budget ? formatLKR(request.budget) : "Not specified"}</dd></div>
              <div><dt className="text-xs text-muted">Related product</dt><dd className="mt-1">{request.product ? <Link href={`/products/${request.product.id}`} className="text-primary hover:underline">{request.product.code} — {request.product.name}</Link> : "Not linked"}</dd></div>
              <div><dt className="text-xs text-muted">Possible supplier</dt><dd className="mt-1">{request.supplier ? <Link href={`/suppliers/${request.supplier.id}`} className="text-primary hover:underline">{request.supplier.name}</Link> : "Not decided"}</dd></div>
              <div><dt className="text-xs text-muted">Assigned to</dt><dd className="mt-1">{request.assignedTo.name}</dd></div>
              <div><dt className="text-xs text-muted">Expected arrival</dt><dd className="mt-1">{formatDate(request.expectedArrivalDate)}</dd></div>
            </dl>
            {request.description && <div className="mt-5 border-t border-border pt-4"><p className="mb-1 text-xs text-muted">Notes</p><p className="whitespace-pre-wrap text-sm">{request.description}</p></div>}
          </CardContent></Card>

          <Card><CardHeader><CardTitle>History</CardTitle></CardHeader><CardContent>
            <ol className="space-y-4">
              {request.events.map((event) => <li key={event.id} className="relative border-l-2 border-border pl-4 text-sm">
                <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{requestStatusLabel(event.toStatus)}</span><span className="text-xs text-muted">{formatDateTime(event.createdAt)} · {event.createdBy.name}</span></div>
                {event.note && <p className="mt-1 whitespace-pre-wrap text-muted">{event.note}</p>}
              </li>)}
            </ol>
          </CardContent></Card>
        </div>

        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Customer</CardTitle></CardHeader><CardContent className="space-y-3">
            <div><p className="font-medium">{request.customer ? <Link href={`/customers/${request.customer.id}`} className="text-primary hover:underline">{contactName}</Link> : contactName}</p>{contactPhone && <p className="mt-0.5 text-sm text-muted">{contactPhone}</p>}</div>
            {contactPhone && <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${contactPhone}`}><Button variant="outline" className="w-full"><Phone className="h-4 w-4" /> Call</Button></a>
              <a href={`sms:${contactPhone}`}><Button variant="outline" className="w-full"><MessageSquare className="h-4 w-4" /> SMS</Button></a>
            </div>}
          </CardContent></Card>

          <Card><CardHeader><CardTitle>Update progress</CardTitle></CardHeader><CardContent>
            <CustomerRequestStatusForm action={updateCustomerRequestStatus.bind(null, request.id)} currentStatus={request.status} />
          </CardContent></Card>

          <Card><CardContent className="text-xs text-muted">Created {formatDateTime(request.createdAt)} by {request.createdBy.name}<br />Last updated {formatDateTime(request.updatedAt)}</CardContent></Card>
        </div>
      </div>
    </div>
  );
}
