import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewSale } from "@/components/new-sale";
import { nonTaxableEnabled } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const [employees, customers, ntEnabled] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
      take: 500,
    }),
    nonTaxableEnabled(),
  ]);

  return (
    <div>
      <PageHeader title="New Sale" subtitle="Create a cash invoice" />
      <NewSale employees={employees} customers={customers} nonTaxableEnabled={ntEnabled} />
    </div>
  );
}
