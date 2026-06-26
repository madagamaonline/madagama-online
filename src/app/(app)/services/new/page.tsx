import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ServiceJobForm } from "@/components/service-job-form";
import { createServiceJob } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewServiceJobPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
    take: 1000,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New service job" subtitle="Record an after-sale service or warranty repair" />
      <ServiceJobForm action={createServiceJob} customers={customers} submitLabel="Create service job" />
    </div>
  );
}
