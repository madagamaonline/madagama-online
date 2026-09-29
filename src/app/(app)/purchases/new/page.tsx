import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PurchaseForm } from "@/components/purchase-form";
import { toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; resume?: string; product?: string }>;
}) {
  const { supplier, resume, product: productId } = await searchParams;
  const [suppliers, product] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    resume === "1" && productId ? prisma.product.findUnique({
      where: { id: productId, active: true },
      select: { id: true, code: true, name: true, modelNumber: true, costPrice: true, quantityInStock: true, trackingType: true, defaultUnit: true },
    }) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader title="New Purchase" subtitle="Receive stock from a supplier" />
      <PurchaseForm
        suppliers={suppliers}
        defaultSupplierId={supplier ?? ""}
        resumeDraft={resume === "1"}
        createdProduct={product ? {
          id: product.id,
          code: product.code,
          name: product.name,
          modelNumber: product.modelNumber,
          costPrice: toNum(product.costPrice),
          stock: toNum(product.quantityInStock),
          trackingType: product.trackingType,
          defaultUnit: product.defaultUnit,
        } : null}
      />
    </div>
  );
}
