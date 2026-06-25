import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { createSupplier } from "../actions";

export const dynamic = "force-dynamic";

export default function NewSupplierPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New Supplier" />
      <SupplierForm action={createSupplier} submitLabel="Create Supplier" />
    </div>
  );
}
