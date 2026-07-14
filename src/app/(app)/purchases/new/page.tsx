import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PurchaseForm } from "@/components/purchase-form";
import { nonTaxableEnabled } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier } = await searchParams;
  const [suppliers, categories, ntEnabled] = await Promise.all([
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
    nonTaxableEnabled(),
  ]);

  return (
    <div>
      <PageHeader title="New Purchase" subtitle="Receive stock from a supplier" />
      <PurchaseForm
        suppliers={suppliers}
        categories={categories}
        nonTaxableEnabled={ntEnabled}
        defaultSupplierId={supplier ?? ""}
      />
    </div>
  );
}
