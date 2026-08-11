import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";
import { contains, parseSearchQuery, rankByScore, scoreMatch, tokenMatchWhere } from "@/lib/search";

/** Rows fetched before ranking — a wider net than we return, so the sort has room. */
const CANDIDATE_LIMIT = 40;
/** Rows actually returned to the picker. */
const RESULT_LIMIT = 12;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = parseSearchQuery(searchParams.get("q"));
  if (parsed.isEmpty) return NextResponse.json({ results: [] });

  // Every token has to match something, so "hon 125" finds "Honda CB 125"
  // without the words having to be adjacent or in order.
  const tokens = tokenMatchWhere<Prisma.ProductWhereInput>(parsed.tokens, (token) => [
    { code: contains(token) },
    { name: contains(token) },
    { barcode: contains(token) },
    { modelNumber: contains(token) },
    { serialNumber: contains(token) },
  ]);

  // A purely numeric query (or "#123") is a sticker short code — match it
  // exactly alongside the usual text search.
  const where: Prisma.ProductWhereInput = {
    active: true,
    ...productTaxableWhere(await nonTaxableEnabled()),
    OR: [
      ...(parsed.shortCode !== null ? [{ shortCode: parsed.shortCode }] : []),
      ...(tokens ? [tokens] : []),
    ],
  };

  const products = await prisma.product.findMany({
    where,
    take: CANDIDATE_LIMIT,
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
      quantityReserved: true,
      trackingType: true,
      defaultUnit: true,
    },
  });

  // The DB narrows; this decides what the cashier sees first. Without it a
  // `take` of alphabetical code order could cut off an exact name or barcode
  // hit entirely.
  const ranked = rankByScore(products, (p) =>
    scoreMatch(parsed, [
      { value: p.code, weight: 4 },
      { value: p.name, weight: 3 },
      { value: p.modelNumber, weight: 2 },
    ]) + (parsed.shortCode !== null && p.shortCode === parsed.shortCode ? 100 : 0),
  );

  return NextResponse.json({
    results: ranked.slice(0, RESULT_LIMIT).map((p) => ({
      id: p.id,
      code: p.code,
      shortCode: p.shortCode,
      name: p.name,
      modelNumber: p.modelNumber,
      sellingPrice: toNum(p.sellingPrice),
      costPrice: toNum(p.costPrice),
      taxable: p.taxable,
      stock: toNum(p.quantityInStock) - toNum(p.quantityReserved),
      physicalStock: toNum(p.quantityInStock),
      reservedStock: toNum(p.quantityReserved),
      trackingType: p.trackingType,
      defaultUnit: p.defaultUnit,
    })),
  });
}
