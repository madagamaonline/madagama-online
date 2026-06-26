import Link from "next/link";
import { Plus, Search, Download, Wrench } from "lucide-react";
import { Prisma, type ServiceJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ServiceStatusBadge, serviceStatusLabel } from "@/components/service-status-badge";
import { formatDate } from "@/lib/utils";
import { businessStartOfMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

const STATUSES: ServiceJobStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const status = STATUSES.includes(sp.status as ServiceJobStatus)
    ? (sp.status as ServiceJobStatus)
    : undefined;

  const where: Prisma.ServiceJobWhereInput = {
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { jobNumber: { contains: query, mode: "insensitive" } },
            { itemName: { contains: query, mode: "insensitive" } },
            { contactName: { contains: query, mode: "insensitive" } },
            { contactPhone: { contains: query, mode: "insensitive" } },
            {
              customer: {
                is: {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { phone: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [jobs, openCount, inProgress, completedThisMonth] = await Promise.all([
    prisma.serviceJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true, phone: true } } },
      take: 200,
    }),
    prisma.serviceJob.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    prisma.serviceJob.count({ where: { status: "IN_PROGRESS" } }),
    prisma.serviceJob.count({
      where: { status: "COMPLETED", completedAt: { gte: businessStartOfMonth() } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Service Jobs"
        subtitle="After-sales service & warranty repair records"
        action={
          <div className="flex gap-2">
            <a href="/api/export/services" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> Export
            </a>
            <Link href="/services/new">
              <Button>
                <Plus className="h-4 w-4" /> New service job
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open jobs" value={String(openCount)} tone="amber" icon={Wrench} />
        <StatCard label="In progress" value={String(inProgress)} tone="blue" />
        <StatCard label="Completed this month" value={String(completedThisMonth)} tone="green" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <form className="flex flex-wrap items-center gap-2">
              <div className="relative max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder="Search job #, item, customer or phone…"
                  className="pl-9"
                />
              </div>
              <Select name="status" defaultValue={status ?? ""} className="w-44">
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {serviceStatusLabel[s]}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="outline">
                Filter
              </Button>
            </form>
          </div>

          {jobs.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query || status ? "No service jobs match." : "No service jobs yet."}
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Job #</TH>
                  <TH>Item</TH>
                  <TH>Customer / contact</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((j) => (
                  <TR key={j.id}>
                    <TD className="font-mono font-medium">
                      <Link href={`/services/${j.id}`} className="text-primary hover:underline">
                        {j.jobNumber}
                      </Link>
                    </TD>
                    <TD>
                      {j.itemName}
                      {j.brand ? <span className="text-muted"> · {j.brand}</span> : null}
                    </TD>
                    <TD className="text-muted">
                      {j.customer
                        ? `${j.customer.name} · ${j.customer.phone}`
                        : j.contactName || j.contactPhone
                          ? `${j.contactName ?? "Walk-in"}${j.contactPhone ? ` · ${j.contactPhone}` : ""}`
                          : "Walk-in"}
                    </TD>
                    <TD>
                      <ServiceStatusBadge status={j.status} />
                    </TD>
                    <TD className="text-muted">{formatDate(j.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
