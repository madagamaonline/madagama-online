import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { invoiceTaxableWhere, nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";
import { contains, parseSearchQuery, rankByScore, scoreMatch, tokenMatchWhere } from "@/lib/search";

/** Candidates fetched per entity before ranking. */
const CANDIDATE_LIMIT = 20;
/** Rows returned per entity — the palette shows a handful of each. */
const RESULT_LIMIT = 5;

/**
 * Cross-entity search for the command palette (⌘K), which previously found
 * products only. One round trip covers products, customers, invoices and
 * service jobs so the palette can act as a single "find anything" box.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = parseSearchQuery(searchParams.get("q"));
  if (parsed.isEmpty) {
    return NextResponse.json({ products: [], customers: [], invoices: [], serviceJobs: [] });
  }

  const ntEnabled = await nonTaxableEnabled();

  const productTokens = tokenMatchWhere<Prisma.ProductWhereInput>(parsed.tokens, (t) => [
    { code: contains(t) },
    { name: contains(t) },
    { barcode: contains(t) },
    { modelNumber: contains(t) },
  ]);
  const customerTokens = tokenMatchWhere<Prisma.CustomerWhereInput>(parsed.tokens, (t) => {
    const digits = t.replace(/\D/g, "");
    const fields: Prisma.CustomerWhereInput[] = [{ name: contains(t) }, { nic: contains(t) }];
    if (digits) fields.push({ phone: contains(digits) });
    return fields;
  });
  const invoiceTokens = tokenMatchWhere<Prisma.InvoiceWhereInput>(parsed.tokens, (t) => [
    { invoiceNumber: contains(t) },
    { customer: { name: contains(t) } },
  ]);
  const jobTokens = tokenMatchWhere<Prisma.ServiceJobWhereInput>(parsed.tokens, (t) => [
    { jobNumber: contains(t) },
    { itemName: contains(t) },
    { brand: contains(t) },
    { contactName: contains(t) },
    { customer: { name: contains(t) } },
  ]);

  const [products, customers, invoices, serviceJobs] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        ...productTaxableWhere(ntEnabled),
        OR: [
          ...(parsed.shortCode !== null ? [{ shortCode: parsed.shortCode }] : []),
          ...(productTokens ? [productTokens] : []),
        ],
      },
      take: CANDIDATE_LIMIT,
      orderBy: { code: "asc" },
      select: { id: true, code: true, shortCode: true, name: true, sellingPrice: true, quantityInStock: true, quantityReserved: true },
    }),
    prisma.customer.findMany({
      where: customerTokens ?? {},
      take: CANDIDATE_LIMIT,
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, nic: true },
    }),
    prisma.invoice.findMany({
      where: { ...invoiceTaxableWhere(ntEnabled), ...(invoiceTokens ?? {}) },
      take: CANDIDATE_LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, grandTotal: true, createdAt: true, customer: { select: { name: true } } },
    }),
    prisma.serviceJob.findMany({
      where: jobTokens ?? {},
      take: CANDIDATE_LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, jobNumber: true, itemName: true, status: true, customer: { select: { name: true } }, contactName: true },
    }),
  ]);

  return NextResponse.json({
    products: rankByScore(products, (p) =>
      scoreMatch(parsed, [
        { value: p.code, weight: 4 },
        { value: p.name, weight: 3 },
      ]) + (parsed.shortCode !== null && p.shortCode === parsed.shortCode ? 100 : 0),
    )
      .slice(0, RESULT_LIMIT)
      .map((p) => ({
        id: p.id,
        code: p.code,
        shortCode: p.shortCode,
        name: p.name,
        sellingPrice: toNum(p.sellingPrice),
        stock: toNum(p.quantityInStock) - toNum(p.quantityReserved),
      })),
    customers: rankByScore(customers, (c) =>
      scoreMatch(parsed, [
        { value: c.name, weight: 3 },
        { value: c.phone, weight: 2 },
        { value: c.nic, weight: 2 },
      ]) + (parsed.phone && c.phone === parsed.phone ? 40 : 0),
    ).slice(0, RESULT_LIMIT),
    invoices: rankByScore(invoices, (i) =>
      scoreMatch(parsed, [
        { value: i.invoiceNumber, weight: 4 },
        { value: i.customer?.name, weight: 2 },
      ]),
    )
      .slice(0, RESULT_LIMIT)
      .map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        grandTotal: toNum(i.grandTotal),
        customerName: i.customer?.name ?? null,
      })),
    serviceJobs: rankByScore(serviceJobs, (j) =>
      scoreMatch(parsed, [
        { value: j.jobNumber, weight: 4 },
        { value: j.itemName, weight: 3 },
        { value: j.customer?.name ?? j.contactName, weight: 2 },
      ]),
    )
      .slice(0, RESULT_LIMIT)
      .map((j) => ({
        id: j.id,
        jobNumber: j.jobNumber,
        itemName: j.itemName,
        status: j.status,
        customerName: j.customer?.name ?? j.contactName ?? null,
      })),
  });
}
