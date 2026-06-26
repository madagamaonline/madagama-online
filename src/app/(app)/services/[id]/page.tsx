import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  CheckCircle2,
  Phone,
  User as UserIcon,
  ShieldCheck,
  Wrench,
  History,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { ServiceStatusControl } from "@/components/service-status-control";
import { ServiceAddNote } from "@/components/service-add-note";
import { formatDateTime } from "@/lib/utils";
import { deleteServiceJob } from "../actions";

export const dynamic = "force-dynamic";

export default async function ServiceJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const job = await prisma.serviceJob.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      createdBy: { select: { name: true } },
      events: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true } } },
      },
    },
  });
  if (!job) notFound();

  const photos = job.photoKeys.filter(Boolean);
  const isImage = (k: string) => /\.(jpe?g|png|webp|gif)$/i.test(k);

  return (
    <div className="mx-auto max-w-4xl">
      {isNew && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5" /> Service job created.
        </div>
      )}

      <PageHeader
        title={job.jobNumber}
        subtitle={job.itemName}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/services/${job.id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
            <DeleteButton
              onDelete={deleteServiceJob.bind(null, job.id)}
              confirmText={`Delete service job ${job.jobNumber}? This can't be undone.`}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main details */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Item & issue</CardTitle>
              {job.underWarranty && (
                <Badge tone="blue" className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Under warranty
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-faint">Item</p>
                  <p className="font-medium text-foreground">{job.itemName}</p>
                </div>
                <div>
                  <p className="text-xs text-faint">Brand / model</p>
                  <p className="text-foreground">{job.brand ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-faint">Serial number</p>
                  <p className="text-foreground">{job.serialNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-faint">Type</p>
                  <p className="text-foreground">{job.underWarranty ? "Warranty repair" : "Paid / other"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-faint">Problem / requested work</p>
                <p className="whitespace-pre-wrap text-foreground">{job.issue}</p>
              </div>
              {job.resolution && (
                <div>
                  <p className="text-xs text-faint">Work done / resolution</p>
                  <p className="whitespace-pre-wrap text-foreground">{job.resolution}</p>
                </div>
              )}
              {job.notes && (
                <div>
                  <p className="text-xs text-faint">Internal notes</p>
                  <p className="whitespace-pre-wrap text-muted">{job.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Photos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {photos.map((k) => (
                    <a
                      key={k}
                      href={`/api/files/${k}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-border"
                    >
                      {isImage(k) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/files/${k}`} alt="Service photo" className="h-32 w-32 object-cover" />
                      ) : (
                        <span className="flex h-32 w-32 items-center justify-center bg-input text-xs text-muted">
                          Document
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {job.events.map((ev) => (
                  <li key={ev.id} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        {ev.type === "CREATED" && "Service job created"}
                        {ev.type === "STATUS_CHANGE" && ev.status && (
                          <span className="inline-flex items-center gap-1.5">
                            Status changed to <ServiceStatusBadge status={ev.status} />
                          </span>
                        )}
                        {ev.type === "NOTE" && <span className="whitespace-pre-wrap">{ev.note}</span>}
                      </p>
                      {ev.type === "STATUS_CHANGE" && ev.note && (
                        <p className="whitespace-pre-wrap text-sm text-muted">{ev.note}</p>
                      )}
                      <p className="mt-0.5 text-xs text-faint">
                        {formatDateTime(ev.createdAt)} · {ev.createdBy?.name ?? "—"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-5 border-t border-border-subtle pt-4">
                <ServiceAddNote id={job.id} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: status + contact + meta */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted" /> Status
              </CardTitle>
              <ServiceStatusBadge status={job.status} />
            </CardHeader>
            <CardContent>
              <ServiceStatusControl id={job.id} current={job.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {job.customer ? (
                <>
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <UserIcon className="h-4 w-4 text-muted" />
                    <Link href={`/customers/${job.customer.id}`} className="text-primary hover:underline">
                      {job.customer.name}
                    </Link>
                  </p>
                  <p className="flex items-center gap-2 text-muted">
                    <Phone className="h-4 w-4" /> {job.customer.phone}
                  </p>
                </>
              ) : job.contactName || job.contactPhone ? (
                <>
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <UserIcon className="h-4 w-4 text-muted" /> {job.contactName ?? "Walk-in"}
                  </p>
                  {job.contactPhone && (
                    <p className="flex items-center gap-2 text-muted">
                      <Phone className="h-4 w-4" /> {job.contactPhone}
                    </p>
                  )}
                  <Badge tone="gray">Walk-in</Badge>
                </>
              ) : (
                <p className="text-muted">Walk-in (no contact recorded)</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1.5 py-4 text-xs text-muted">
              <p>Created {formatDateTime(job.createdAt)}</p>
              {job.createdBy?.name && <p>By {job.createdBy.name}</p>}
              {job.completedAt && <p>Completed {formatDateTime(job.completedAt)}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
