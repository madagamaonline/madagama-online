import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, businessDayKey, businessMonthKey, businessStartOfMonth } from "@/lib/dates";
import { getSupplierSalesReport } from "@/lib/supplier-sales";
import { round2, toNum } from "@/lib/utils";

export type TaxBucket = "TAXABLE" | "NON_TAXABLE";
export type TaxTotals = { taxable: number; nonTaxable: number; unclassified: number; total: number };
const empty = (): TaxTotals => ({ taxable: 0, nonTaxable: 0, unclassified: 0, total: 0 });
function add(bucket: TaxTotals, category: TaxBucket | null, amount: number) {
  if (category === "TAXABLE") bucket.taxable += amount;
  else if (category === "NON_TAXABLE") bucket.nonTaxable += amount;
  else bucket.unclassified += amount;
  bucket.total += amount;
}
function finish(bucket: TaxTotals): TaxTotals {
  return Object.fromEntries(Object.entries(bucket).map(([key, value]) => [key, round2(value)])) as TaxTotals;
}
export function reportMonth(raw: string | undefined, now = new Date()) {
  const current = businessMonthKey(now);
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= current ? raw : current;
}

export async function getTaxReport(rawMonth?: string) {
  const month = reportMonth(rawMonth);
  const start = businessStartOfMonth(new Date(`${month}-15T00:00:00Z`));
  const end = businessStartOfMonth(addDays(start, 45));
  const label = new Date(`${month}-01T12:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const [invoices, customerReturns, purchases, supplierReturns, supplierSales] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: start, lt: end }, voidedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, createdAt: true, taxCategory: true, grandTotal: true, type: true, customer: { select: { name: true } } },
    }),
    prisma.salesReturn.findMany({
      where: { date: { gte: start, lt: end }, OR: [{ invoiceId: null }, { invoice: { voidedAt: null } }] },
      orderBy: { date: "desc" },
      select: { id: true, date: true, totalRefund: true, invoice: { select: { invoiceNumber: true, taxCategory: true } }, items: { select: { qty: true, lineTotal: true, product: { select: { code: true, name: true } } } } },
    }),
    prisma.purchase.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
      select: { id: true, date: true, supplierInvoiceNo: true, supplier: { select: { id: true, name: true } }, total: true, items: { select: { id: true, qty: true, lineTotal: true, product: { select: { code: true, name: true, taxable: true } } } } },
    }),
    prisma.supplierReturn.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
      select: { id: true, date: true, totalValue: true, supplier: { select: { id: true, name: true } }, items: { select: { qty: true, lineTotal: true, product: { select: { code: true, name: true, taxable: true } } } } },
    }),
    getSupplierSalesReport(month),
  ]);

  const sales = empty();
  const refunds = empty();
  const purchased = empty();
  const returnedToSupplier = empty();
  const daily = new Map<string, TaxTotals>();
  const supplierSalesMap = new Map<string, { supplier: string; sales: TaxTotals; returns: TaxTotals }>();
  const supplierPurchaseMap = new Map<string, { supplier: string; purchases: TaxTotals; returns: TaxTotals }>();
  for (const invoice of invoices) {
    const amount = toNum(invoice.grandTotal);
    add(sales, invoice.taxCategory, amount);
    const key = businessDayKey(invoice.createdAt);
    const row = daily.get(key) ?? empty();
    add(row, invoice.taxCategory, amount);
    daily.set(key, row);
  }
  for (const row of customerReturns) add(refunds, row.invoice?.taxCategory ?? null, toNum(row.totalRefund));
  for (const line of supplierSales.details) {
    const key = line.supplierId ?? `name:${line.supplierName}`;
    const row = supplierSalesMap.get(key) ?? { supplier: line.supplierName, sales: empty(), returns: empty() };
    add(line.kind === "SALE" ? row.sales : row.returns, line.taxCategory, line.kind === "SALE" ? line.sales : line.returns);
    supplierSalesMap.set(key, row);
  }
  const purchaseLines: { date: Date; supplier: string; reference: string; product: string; quantity: number; category: TaxBucket; amount: number }[] = [];
  for (const purchase of purchases) {
    const key = purchase.supplier.id;
    const row = supplierPurchaseMap.get(key) ?? { supplier: purchase.supplier.name, purchases: empty(), returns: empty() };
    for (const line of purchase.items) {
      const category = line.product.taxable ? "TAXABLE" : "NON_TAXABLE";
      const amount = toNum(line.lineTotal);
      add(purchased, category, amount);
      add(row.purchases, category, amount);
      purchaseLines.push({ date: purchase.date, supplier: purchase.supplier.name, reference: purchase.supplierInvoiceNo ?? purchase.id, product: `${line.product.code} · ${line.product.name}`, quantity: toNum(line.qty), category, amount });
    }
    supplierPurchaseMap.set(key, row);
  }
  for (const supplierReturn of supplierReturns) {
    const key = supplierReturn.supplier.id;
    const row = supplierPurchaseMap.get(key) ?? { supplier: supplierReturn.supplier.name, purchases: empty(), returns: empty() };
    for (const line of supplierReturn.items) {
      const category = line.product.taxable ? "TAXABLE" : "NON_TAXABLE";
      const amount = toNum(line.lineTotal);
      add(returnedToSupplier, category, amount);
      add(row.returns, category, amount);
    }
    supplierPurchaseMap.set(key, row);
  }
  const net = (gross: TaxTotals, less: TaxTotals) => finish({ taxable: gross.taxable - less.taxable, nonTaxable: gross.nonTaxable - less.nonTaxable, unclassified: gross.unclassified - less.unclassified, total: gross.total - less.total });
  return {
    month, label, start, end,
    sales: finish(sales), refunds: finish(refunds), netSales: net(sales, refunds),
    purchases: finish(purchased), supplierReturns: finish(returnedToSupplier), netPurchases: net(purchased, returnedToSupplier),
    purchaseHeaderTotal: round2(purchases.reduce((sum, row) => sum + toNum(row.total), 0)),
    supplierReturnHeaderTotal: round2(supplierReturns.reduce((sum, row) => sum + toNum(row.totalValue), 0)),
    invoiceCount: { taxable: invoices.filter((row) => row.taxCategory === "TAXABLE").length, nonTaxable: invoices.filter((row) => row.taxCategory === "NON_TAXABLE").length, total: invoices.length },
    daily: [...daily.entries()].map(([day, totals]) => ({ day, ...finish(totals) })).sort((a, b) => a.day.localeCompare(b.day)),
    supplierSales: [...supplierSalesMap.values()].map((row) => ({ supplier: row.supplier, sales: finish(row.sales), returns: finish(row.returns), net: net(row.sales, row.returns) })).sort((a, b) => b.net.total - a.net.total),
    supplierPurchases: [...supplierPurchaseMap.values()].map((row) => ({ supplier: row.supplier, purchases: finish(row.purchases), returns: finish(row.returns), net: net(row.purchases, row.returns) })).sort((a, b) => b.net.total - a.net.total),
    invoices,
    purchaseLines,
    customerReturnLines: customerReturns.flatMap((row) => row.items.map((line) => ({ date: row.date, reference: row.invoice?.invoiceNumber ?? row.id, category: row.invoice?.taxCategory ?? null, product: `${line.product.code} · ${line.product.name}`, quantity: toNum(line.qty), amount: toNum(line.lineTotal) }))),
    supplierReturnLines: supplierReturns.flatMap((row) => row.items.map((line) => ({ date: row.date, supplier: row.supplier.name, reference: row.id, category: (line.product.taxable ? "TAXABLE" : "NON_TAXABLE") as TaxBucket, product: `${line.product.code} · ${line.product.name}`, quantity: toNum(line.qty), amount: toNum(line.lineTotal) }))),
    supplierSalesDetails: supplierSales.details,
  };
}
