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
  const [suppliers, categories] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        subcategories: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true, categoryId: true },
        },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader title="New Purchase" subtitle="Receive stock from a supplier" />
      <PurchaseForm
        suppliers={suppliers}
        categories={categories}
        defaultSupplierId={supplier ?? ""}
      />
    </div>
  );
}
