import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ServiceJobForm } from "@/components/service-job-form";
import { updateServiceJob } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditServiceJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, customers] = await Promise.all([
    prisma.serviceJob.findUnique({ where: { id } }),
    // Recent-customer seed only; the picker searches the server as you type and
    // resolves the job's existing customer by id.
    prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, nic: true },
      take: 8,
    }),
  ]);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${job.jobNumber}`} subtitle={job.itemName} />
      <ServiceJobForm
        action={updateServiceJob.bind(null, job.id)}
        customers={customers}
        submitLabel="Save changes"
        initial={{
          itemName: job.itemName,
          brand: job.brand ?? "",
          serialNumber: job.serialNumber ?? "",
          underWarranty: job.underWarranty,
          issue: job.issue,
          resolution: job.resolution ?? "",
          notes: job.notes ?? "",
          customerId: job.customerId ?? "",
          contactName: job.contactName ?? "",
          contactPhone: job.contactPhone ?? "",
          photoKeys: job.photoKeys,
        }}
      />
    </div>
  );
}
