import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { updateSupplier } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit Supplier" subtitle={s.name} />
      <SupplierForm
        action={updateSupplier.bind(null, id)}
        submitLabel="Save Changes"
        initial={{
          name: s.name,
          contactPerson: s.contactPerson ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
        }}
      />
    </div>
  );
}
