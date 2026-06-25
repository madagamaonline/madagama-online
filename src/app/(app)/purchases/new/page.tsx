import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PurchaseForm } from "@/components/purchase-form";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier } = await searchParams;
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <PageHeader title="New Purchase" subtitle="Receive stock from a supplier" />
      <PurchaseForm suppliers={suppliers} defaultSupplierId={supplier ?? ""} />
    </div>
  );
}
