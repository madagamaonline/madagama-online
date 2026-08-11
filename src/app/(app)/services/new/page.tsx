import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ServiceJobForm } from "@/components/service-job-form";
import { createServiceJob } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewServiceJobPage() {
  // Recent-customer seed only; the picker searches the server as you type.
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, phone: true, nic: true },
    take: 8,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New service job" subtitle="Record an after-sale service or warranty repair" />
      <ServiceJobForm action={createServiceJob} customers={customers} submitLabel="Create service job" />
    </div>
  );
}
