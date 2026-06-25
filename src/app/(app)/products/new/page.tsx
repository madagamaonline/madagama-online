import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { Button } from "@/components/ui/button";
import { nonTaxableEnabled } from "@/lib/tax-mode";
import { createProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [categories, suppliers, ntEnabled] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { subcategories: { orderBy: { name: "asc" } } },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    nonTaxableEnabled(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New Product" subtitle="A code is generated automatically from the category" />
      {categories.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="mb-3 text-sm text-muted">
            You need at least one category and subcategory before adding products.
          </p>
          <Link href="/products/categories">
            <Button>Set up categories</Button>
          </Link>
        </div>
      ) : (
        <ProductForm
          categories={categories}
          suppliers={suppliers}
          action={createProduct}
          submitLabel="Create Product"
          nonTaxableEnabled={ntEnabled}
        />
      )}
    </div>
  );
}
