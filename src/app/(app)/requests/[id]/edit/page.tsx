import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { businessDayKey } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { CustomerRequestForm } from "@/components/customer-request-form";
import { updateCustomerRequest } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCustomerRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const [request, customers, products, suppliers, users] = await Promise.all([
    prisma.customerRequest.findUnique({ where: { id } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true }, take: 1000 }),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true }, take: 1000 }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true }, take: 1000 }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!request) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Edit REQ-${String(request.requestNumber).padStart(4, "0")}`} subtitle="Update request details and reminder settings" />
      <CustomerRequestForm
        action={updateCustomerRequest.bind(null, id)}
        customers={customers}
        products={products}
        suppliers={suppliers}
        users={users}
        defaultAssigneeId={user.id}
        initial={{
          title: request.title,
          type: request.type,
          description: request.description ?? "",
          quantity: request.quantity,
          budget: request.budget?.toString() ?? "",
          priority: request.priority,
          customerId: request.customerId ?? "",
          contactName: request.contactName ?? "",
          contactPhone: request.contactPhone ?? "",
          productId: request.productId ?? "",
          supplierId: request.supplierId ?? "",
          assignedToUserId: request.assignedToUserId,
          followUpDate: request.followUpAt ? businessDayKey(request.followUpAt) : "",
          expectedArrivalDate: request.expectedArrivalDate ? businessDayKey(request.expectedArrivalDate) : "",
          remindBySms: request.remindBySms,
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
