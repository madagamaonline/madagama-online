import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";
import { parseShortCode } from "@/lib/product-code";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  // A purely numeric query (or "#123") is a sticker short code — match it
  // exactly alongside the usual text search.
  const shortCode = parseShortCode(q);

  // When non-taxable is off, the POS/credit pickers must never surface NT items.
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...productTaxableWhere(await nonTaxableEnabled()),
      OR: [
        ...(shortCode !== null ? [{ shortCode }] : []),
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        { modelNumber: { contains: q, mode: "insensitive" } },
        { serialNumber: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 12,
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      shortCode: true,
      name: true,
      modelNumber: true,
      sellingPrice: true,
      costPrice: true,
      taxable: true,
      quantityInStock: true,
    },
  });

  // The exact sticker-code hit belongs at the top of the dropdown.
  if (shortCode !== null) {
    products.sort((a, b) => Number(b.shortCode === shortCode) - Number(a.shortCode === shortCode));
  }

  return NextResponse.json({
    results: products.map((p) => ({
      id: p.id,
      code: p.code,
      shortCode: p.shortCode,
      name: p.name,
      modelNumber: p.modelNumber,
      sellingPrice: toNum(p.sellingPrice),
      costPrice: toNum(p.costPrice),
      taxable: p.taxable,
      stock: p.quantityInStock,
    })),
  });
}
