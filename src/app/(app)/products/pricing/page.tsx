import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/settings";
import { toNum } from "@/lib/utils";
import { BulkPricingForm } from "./pricing-form";

export const dynamic = "force-dynamic";

export default async function BulkPricingPage() {
  await requireAdmin(); // non-admins are redirected to /dashboard

  const [categories, suppliers, settings] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { subcategories: { orderBy: { name: "asc" } } },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);

  const cats = categories.map((c) => ({
    id: c.id,
    name: c.name,
    subcategories: c.subcategories.map((s) => ({ id: s.id, name: s.name })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Bulk pricing"
        subtitle="Re-price a whole category or supplier — preview before applying"
      />
      <BulkPricingForm
        categories={cats}
        suppliers={suppliers}
        defaultTargetMarginPct={toNum(settings?.defaultTargetMarginPct ?? 20)}
      />
    </div>
  );
}
