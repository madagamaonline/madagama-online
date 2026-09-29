import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/settings";
import { peekNextShortCode } from "@/lib/product-code";
import { toNum } from "@/lib/utils";
import { createProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; name?: string; supplier?: string }>;
}) {
  const params = await searchParams;
  const returnToPurchase = params.from === "purchase";
  const [categories, suppliers, settings, nextShortCode] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { subcategories: { orderBy: { name: "asc" } } },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
    peekNextShortCode(),
  ]);
  const defaultTargetMarginPct = toNum(settings?.defaultTargetMarginPct ?? 20);
  const initialSupplierId = returnToPurchase && suppliers.some((supplier) => supplier.id === params.supplier) ? params.supplier : "";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New Product" subtitle="A code is generated automatically from the category" />
      {returnToPurchase && (
        <div className="mb-4 rounded-xl border border-border bg-primary-soft px-4 py-3 text-sm text-primary-ink">
          Your purchase draft is saved. After creating this product, you’ll return to the purchase with it selected. Leave opening stock at 0 if these items will be received through the purchase.
        </div>
      )}
      {categories.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="mb-3 text-sm text-muted">
            You need at least one category before adding products.
          </p>
          <Link href="/products/categories">
            <Button>Set up categories</Button>
          </Link>
          {returnToPurchase && <Link href="/purchases/new?resume=1" className="ml-3 text-sm font-semibold text-primary hover:underline">Return to purchase</Link>}
        </div>
      ) : (
        <ProductForm
          categories={categories}
          suppliers={suppliers}
          action={createProduct}
          submitLabel="Create Product"
          defaultTargetMarginPct={defaultTargetMarginPct}
          nextShortCode={nextShortCode}
          initialName={returnToPurchase ? (params.name ?? "").slice(0, 200) : ""}
          initialSupplierId={initialSupplierId}
          returnToPurchase={returnToPurchase}
        />
      )}
    </div>
  );
}
