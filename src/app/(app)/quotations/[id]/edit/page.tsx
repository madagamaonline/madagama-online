import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { QuotationForm, type QuotationInitial } from "@/components/quotation-form";
import { updateQuotation, type QuotationInput } from "@/app/(app)/quotations/actions";
import { toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [quotation, customers, employees] = await Promise.all([
    prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    }),
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

  if (!quotation) notFound();

  const initial: QuotationInitial = {
    customerId: quotation.customerId ?? "",
    customerName: quotation.customerName ?? "",
    address: quotation.address ?? "",
    phone: quotation.phone ?? "",
    branch: quotation.branch ?? "",
    soldByEmployeeId: quotation.soldByEmployeeId ?? "",
    discount: toNum(quotation.discount),
    validUntil: quotation.validUntil ? quotation.validUntil.toISOString().slice(0, 10) : "",
    notes: quotation.notes ?? "",
    lines: quotation.items.map((it) => ({
      key: it.id,
      productId: it.productId ?? null,
      model: it.model ?? "",
      name: it.name,
      description: it.description ?? "",
      qty: it.qty,
      unitPrice: toNum(it.unitPrice),
    })),
  };

  async function action(input: QuotationInput) {
    "use server";
    return updateQuotation(id, input);
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${quotation.quotationNumber}`}
        subtitle="Update this quotation"
      />
      <QuotationForm
        customers={customers}
        employees={employees}
        onSubmit={action}
        initial={initial}
        submitLabel="Save changes"
      />
    </div>
  );
}
