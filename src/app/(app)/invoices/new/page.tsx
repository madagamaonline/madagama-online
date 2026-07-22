import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewSale } from "@/components/new-sale";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { requireUser } from "@/lib/auth";
import { canAccessStaffFinance } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const session = await requireUser();
  const [employees, customers, ntEnabled] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, nic: true },
      take: 500,
    }),
    nonTaxableEnabled(),
  ]);

  return (
    <div>
      <PageHeader title="New Sale" subtitle="Cash, Pay Later, or formal credit" />
      <NewSale employees={employees} customers={customers} nonTaxableEnabled={ntEnabled} canPayLater={canAccessStaffFinance(session.role)} />
    </div>
  );
}
