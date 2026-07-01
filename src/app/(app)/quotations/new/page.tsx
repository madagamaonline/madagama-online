import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { QuotationForm } from "@/components/quotation-form";
import { createQuotation, type QuotationInput } from "@/app/(app)/quotations/actions";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const [customers, cashiers, session] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, address: true },
      take: 500,
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getSession(),
  ]);

  async function action(input: QuotationInput) {
    "use server";
    return createQuotation(input);
  }

  return (
    <div>
      <PageHeader title="New Quotation" subtitle="Prepare a price quote for a customer" />
      <QuotationForm
        customers={customers}
        cashiers={cashiers}
        onSubmit={action}
        initial={{
          customerId: "",
          customerName: "",
          address: "",
          phone: "",
          // Default to the logged-in cashier — they're the one preparing it.
          preparedByUserId: session?.id ?? "",
          discount: 0,
          validUntil: "",
          notes: "",
          lines: [],
        }}
      />
    </div>
  );
}
