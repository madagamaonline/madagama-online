import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewSale } from "@/components/new-sale";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { requireUser } from "@/lib/auth";
import { canCreatePayLaterSale } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const session = await requireUser();
  const [employees, customers, ntEnabled] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Only a small "recent" seed for the picker's empty state — it searches the
    // server from the first keystroke, so the full list is never shipped.
    prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, nic: true },
      take: 8,
    }),
    nonTaxableEnabled(),
  ]);

  return (
    <div>
      <PageHeader title="New Sale" subtitle="Cash, Pay Later, or formal credit" />
      <NewSale employees={employees} customers={customers} nonTaxableEnabled={ntEnabled} canPayLater={canCreatePayLaterSale(session.role)} />
    </div>
  );
}
