import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse, csvDate } from "@/lib/csv";
import { toNum } from "@/lib/utils";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

export async function GET() {
  // Full stock valuation (cost prices) — re-check auth here, not just in the proxy.
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }
  // When non-taxable is off, export taxable products only and drop the Taxable
  // column (every row would say "Yes" anyway).
  const ntEnabled = await nonTaxableEnabled();
  const products = await prisma.product.findMany({
    where: { ...productTaxableWhere(ntEnabled) },
    orderBy: { code: "asc" },
    include: { category: true, subcategory: true, primarySupplier: { select: { name: true } } },
    take: 5000,
  });

  const csv = toCsv(
    [
      "Sticker #",
      "Code",
      "Name",
      "Category",
      "Subcategory",
      "Cost",
      "Price",
      "Margin %",
      "In stock",
      "Reorder level",
      "Stock value (cost)",
      ...(ntEnabled ? ["Taxable"] : []),
      "Active",
      "Supplier",
    ],
    products.map((p) => {
      const cost = toNum(p.costPrice);
      const price = toNum(p.sellingPrice);
      const marginPct = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
      return [
        p.shortCode,
        p.code,
        p.name,
        p.category.name,
        p.subcategory?.name ?? "",
        cost,
        price,
        marginPct,
        p.quantityInStock,
        p.reorderLevel,
        Math.round(cost * p.quantityInStock * 100) / 100,
        ...(ntEnabled ? [p.taxable ? "Yes" : "No"] : []),
        p.active ? "Yes" : "No",
        p.primarySupplier?.name ?? "",
      ];
    }),
  );

  return csvResponse(csv, `stock-${csvDate(new Date())}.csv`);
}
