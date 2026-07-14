import Link from "next/link";
import { Plus, Search } from "lucide-react";
import type { CustomerRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REQUEST_STATUSES, REQUEST_STATUS_OPTIONS, requestNumber, requestStatusLabel, requestStatusTone, requestTypeLabel } from "@/lib/customer-requests";
import { businessStartOfDay } from "@/lib/dates";
import { formatDate, formatLKR } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

function reminderLabel(date: Date | null): { text: string; tone: "red" | "amber" | "gray" } | null {
  if (!date) return null;
  const days = Math.round((date.getTime() - businessStartOfDay().getTime()) / 86_400_000);
  if (days < 0) return { text: `Overdue ${Math.abs(days)}d`, tone: "red" };
  if (days === 0) return { text: "Today", tone: "amber" };
  if (days === 1) return { text: "Tomorrow", tone: "amber" };
  return { text: formatDate(date), tone: "gray" };
}

export default async function CustomerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const query = (q ?? "").trim();
  const requestedStatus = REQUEST_STATUS_OPTIONS.some((option) => option.value === status) ? status as CustomerRequestStatus : null;
  const where: Prisma.CustomerRequestWhereInput = {
    status: requestedStatus ?? { in: ACTIVE_REQUEST_STATUSES },
    ...(query ? { OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { contactName: { contains: query, mode: "insensitive" } },
      { contactPhone: { contains: query } },
      { customer: { name: { contains: query, mode: "insensitive" } } },
    ] } : {}),
  };
  const requests = await prisma.customerRequest.findMany({
    where,
    include: { customer: { select: { name: true, phone: true } }, assignedTo: { select: { name: true } } },
    orderBy: [{ priority: "desc" }, { followUpAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  return (
    <div>
      <PageHeader title="Customer requests" subtitle="Product inquiries, import requests, and customer follow-ups" action={
        <Link href="/requests/new"><Button><Plus className="h-4 w-4" /> New request</Button></Link>
      } />

      <Card>
        <CardContent className="p-0">
          <form className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-[1fr_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
              <Input name="q" defaultValue={query} placeholder="Search product, customer, phone, or notes…" className="pl-9" />
            </div>
            <Select name="status" defaultValue={requestedStatus ?? "ACTIVE"}>
              <option value="ACTIVE">All active requests</option>
              {REQUEST_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Button type="submit" variant="outline">Filter</Button>
          </form>

          {requests.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">No requests match this view.</div>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {requests.map((request) => {
                  const reminder = reminderLabel(request.followUpAt);
                  return <Link key={request.id} href={`/requests/${request.id}`} className="block p-4 active:bg-border-subtle">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="font-medium">{request.title}</p><p className="mt-0.5 text-xs text-muted">{requestNumber(request.requestNumber)} · {request.customer?.name ?? request.contactName ?? request.contactPhone}</p></div>
                      <Badge tone={requestStatusTone(request.status)}>{requestStatusLabel(request.status)}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{requestTypeLabel(request.type)}</span><span>Qty {request.quantity}</span><span>{request.assignedTo.name}</span>
                      {request.priority === "HIGH" && <Badge tone="red">High</Badge>}
                      {reminder && <Badge tone={reminder.tone}>{reminder.text}</Badge>}
                    </div>
                  </Link>;
                })}
              </div>
              <div className="hidden md:block">
                <Table><THead><TR><TH>Request</TH><TH>Customer</TH><TH>Type</TH><TH>Assigned</TH><TH>Reminder</TH><TH>Status</TH></TR></THead>
                  <TBody>{requests.map((request) => { const reminder = reminderLabel(request.followUpAt); return <TR key={request.id}>
                    <TD><Link href={`/requests/${request.id}`} className="font-medium text-primary hover:underline">{request.title}</Link><div className="text-xs text-muted">{requestNumber(request.requestNumber)} · Qty {request.quantity}{request.budget ? ` · ${formatLKR(request.budget)}` : ""}{request.priority === "HIGH" ? " · High priority" : ""}</div></TD>
                    <TD>{request.customer?.name ?? request.contactName ?? "—"}<div className="text-xs text-muted">{request.customer?.phone ?? request.contactPhone}</div></TD>
                    <TD className="text-muted">{requestTypeLabel(request.type)}</TD><TD>{request.assignedTo.name}</TD>
                    <TD>{reminder ? <Badge tone={reminder.tone}>{reminder.text}</Badge> : "—"}</TD>
                    <TD><Badge tone={requestStatusTone(request.status)}>{requestStatusLabel(request.status)}</Badge></TD>
                  </TR>; })}</TBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
