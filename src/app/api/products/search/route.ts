import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  // When non-taxable is off, the POS/credit pickers must never surface NT items.
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...productTaxableWhere(await nonTaxableEnabled()),
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 12,
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, sellingPrice: true, costPrice: true, taxable: true, quantityInStock: true },
  });

  return NextResponse.json({
    results: products.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      sellingPrice: toNum(p.sellingPrice),
      costPrice: toNum(p.costPrice),
      taxable: p.taxable,
      stock: p.quantityInStock,
    })),
  });
}
