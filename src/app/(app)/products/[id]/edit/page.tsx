import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { toNum } from "@/lib/utils";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { updateProduct } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, categories, suppliers, ntEnabled] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { subcategories: { orderBy: { name: "asc" } } },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    nonTaxableEnabled(),
  ]);

  // When non-taxable is off, a non-taxable product effectively doesn't exist.
  if (!product || (!ntEnabled && !product.taxable)) notFound();

  const updateAction = updateProduct.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit Product" subtitle={product.code} />
      <ProductForm
        categories={categories}
        suppliers={suppliers}
        action={updateAction}
        submitLabel="Save Changes"
        isEdit
        nonTaxableEnabled={ntEnabled}
        initial={{
          code: product.code,
          name: product.name,
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId,
          costPrice: toNum(product.costPrice),
          sellingPrice: toNum(product.sellingPrice),
          quantityInStock: product.quantityInStock,
          reorderLevel: product.reorderLevel,
          taxable: product.taxable,
          barcode: product.barcode ?? "",
          primarySupplierId: product.primarySupplierId ?? "",
          description: product.description ?? "",
        }}
      />
    </div>
  );
}
