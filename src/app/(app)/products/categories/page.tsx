import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CategoryManager } from "@/components/category-manager";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      subcategories: {
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Categories & Subcategories"
        subtitle="Define the codes that build your product codes"
        action={
          <Link href="/products">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back to Products
            </Button>
          </Link>
        }
      />
      <CategoryManager categories={categories} />
    </div>
  );
}
