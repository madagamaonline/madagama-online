import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CustomerRequestForm } from "@/components/customer-request-form";
import { createCustomerRequest } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCustomerRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const [{ customerId }, user] = await Promise.all([searchParams, requireUser()]);
  const [customers, products, suppliers, users] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true }, take: 1000 }),
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true }, take: 1000 }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true }, take: 1000 }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const selectedCustomerId = customers.some((customer) => customer.id === customerId) ? customerId! : "";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New customer request" subtitle="Record a product inquiry, import request, or follow-up" />
      <CustomerRequestForm
        action={createCustomerRequest}
        customers={customers}
        products={products}
        suppliers={suppliers}
        users={users}
        defaultAssigneeId={user.id}
        initial={selectedCustomerId ? {
          title: "", type: "PRODUCT_INQUIRY", description: "", quantity: 1, budget: "", priority: "NORMAL",
          customerId: selectedCustomerId, contactName: "", contactPhone: "", productId: "", supplierId: "",
          assignedToUserId: user.id, followUpDate: "", expectedArrivalDate: "", remindBySms: false,
        } : undefined}
        submitLabel="Create request"
      />
    </div>
  );
}
