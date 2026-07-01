import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { QuotationForm } from "@/components/quotation-form";
import { createQuotation, type QuotationInput } from "@/app/(app)/quotations/actions";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const [customers, employees] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, address: true },
      take: 500,
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  async function action(input: QuotationInput) {
    "use server";
    return createQuotation(input);
  }

  return (
    <div>
      <PageHeader title="New Quotation" subtitle="Prepare a price quote for a customer" />
      <QuotationForm customers={customers} employees={employees} onSubmit={action} />
    </div>
  );
}
