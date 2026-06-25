import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "@/components/customer-form";
import { createCustomer } from "../actions";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New Customer" subtitle="Add a customer and their NIC details" />
      <CustomerForm action={createCustomer} submitLabel="Create Customer" />
    </div>
  );
}
