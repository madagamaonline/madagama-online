import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CreditSale } from "@/components/credit-sale";
import { toNum } from "@/lib/utils";
import { nonTaxableEnabled } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

export default async function NewCreditSalePage() {
  const [customers, employees, setting, ntEnabled] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true }, take: 500 }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.setting.findUnique({ where: { id: 1 } }),
    nonTaxableEnabled(),
  ]);

  return (
    <div>
      <PageHeader title="New Credit Sale" subtitle="Create the sale now and collect guarantor details now or during delivery" />
      <CreditSale
        customers={customers}
        employees={employees}
        interestRatePct={Math.round(toNum(setting?.interestRatePerMonth ?? 0.02) * 100)}
        freeMonths={setting?.interestFreeMonths ?? 4}
        nonTaxableEnabled={ntEnabled}
      />
    </div>
  );
}
