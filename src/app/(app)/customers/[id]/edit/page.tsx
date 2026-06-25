import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "@/components/customer-form";
import { updateCustomer } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit Customer" subtitle={customer.name} />
      <CustomerForm
        action={updateCustomer.bind(null, id)}
        submitLabel="Save Changes"
        initial={{
          name: customer.name,
          phone: customer.phone,
          nic: customer.nic ?? "",
          address: customer.address ?? "",
          email: customer.email ?? "",
          nicFrontKey: customer.nicFrontKey ?? "",
          nicBackKey: customer.nicBackKey ?? "",
        }}
      />
    </div>
  );
}
