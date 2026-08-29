import type { UnitOfMeasure } from "@prisma/client";
import { addDays, businessDayKey, businessMonthKey, businessStartOfDay, businessStartOfMonth } from "@/lib/dates";
import { round2 } from "@/lib/utils";
import type { SupplierSalesDetailRow, SupplierSalesReportOptions } from "@/lib/supplier-sales";

export type UnitQuantities = Record<UnitOfMeasure, number>;

export type ProductPerformanceRow = {
  productId: string | null;
  productCode: string;
  productName: string;
  unit: UnitOfMeasure;
  invoiceCount: number;
  quantitySold: number;
  quantityReturned: number;
  netQuantity: number;
  sales: number;
  returns: number;
  netSales: number;
  netCogs: number;
  grossProfit: number;
  marginPct: number;
};

export type DailySupplierSalesRow = {
  day: string;
  invoiceCount: number;
  sold: UnitQuantities;
  returned: UnitQuantities;
  netSales: number;
  netCogs: number;
  grossProfit: number;
  marginPct: number;
};

const emptyUnits = (): UnitQuantities => ({ EACH: 0, METER: 0, CENTIMETER: 0, MILLIMETER: 0, FOOT: 0, INCH: 0 });

export function aggregateSupplierSales(details: SupplierSalesDetailRow[]) {
  const productMap = new Map<string, ProductPerformanceRow & { invoices: Set<string> }>();
  const dailyMap = new Map<string, DailySupplierSalesRow & { invoices: Set<string> }>();
  const sold = emptyUnits();
  const returned = emptyUnits();

  for (const row of details) {
    const soldQty = row.kind === "SALE" ? Math.abs(row.quantity) : 0;
    const returnedQty = row.kind === "RETURN" ? Math.abs(row.quantity) : 0;
    sold[row.unit] += soldQty;
    returned[row.unit] += returnedQty;
    const netSales = row.sales - row.returns;
    const netCogs = row.cogs - row.returnedCogs;

    const productKey = `${row.productId ?? row.productCode}:${row.unit}`;
    const product = productMap.get(productKey) ?? {
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      unit: row.unit,
      invoiceCount: 0,
      quantitySold: 0,
      quantityReturned: 0,
      netQuantity: 0,
      sales: 0,
      returns: 0,
      netSales: 0,
      netCogs: 0,
      grossProfit: 0,
      marginPct: 0,
      invoices: new Set<string>(),
    };
    product.invoices.add(row.invoiceNumber);
    product.quantitySold += soldQty;
    product.quantityReturned += returnedQty;
    product.sales += row.sales;
    product.returns += row.returns;
    product.netCogs += netCogs;
    productMap.set(productKey, product);

    const dayKey = businessDayKey(row.date);
    const day = dailyMap.get(dayKey) ?? { day: dayKey, invoiceCount: 0, sold: emptyUnits(), returned: emptyUnits(), netSales: 0, netCogs: 0, grossProfit: 0, marginPct: 0, invoices: new Set<string>() };
    day.invoices.add(row.invoiceNumber);
    day.sold[row.unit] += soldQty;
    day.returned[row.unit] += returnedQty;
    day.netSales += netSales;
    day.netCogs += netCogs;
    dailyMap.set(dayKey, day);
  }

  const products = [...productMap.values()].map(({ invoices, ...row }) => {
    row.invoiceCount = invoices.size;
    row.quantitySold = round2(row.quantitySold);
    row.quantityReturned = round2(row.quantityReturned);
    row.netQuantity = round2(row.quantitySold - row.quantityReturned);
    row.sales = round2(row.sales);
    row.returns = round2(row.returns);
    row.netSales = round2(row.sales - row.returns);
    row.netCogs = round2(row.netCogs);
    row.grossProfit = round2(row.netSales - row.netCogs);
    row.marginPct = row.netSales === 0 ? 0 : round2((row.grossProfit / row.netSales) * 100);
    return row;
  }).sort((a, b) => b.netSales - a.netSales || a.productName.localeCompare(b.productName));

  const daily = [...dailyMap.values()].map(({ invoices, ...row }) => {
    row.invoiceCount = invoices.size;
    row.netSales = round2(row.netSales);
    row.netCogs = round2(row.netCogs);
    row.grossProfit = round2(row.netSales - row.netCogs);
    row.marginPct = row.netSales === 0 ? 0 : round2((row.grossProfit / row.netSales) * 100);
    return row;
  }).sort((a, b) => a.day.localeCompare(b.day));

  return { products, daily, sold, returned };
}

export function normalizedReportMonth(raw: string | null | undefined, now = new Date()): string {
  const nowKey = businessMonthKey(now);
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= nowKey ? raw : nowKey;
}

export function monthBounds(key: string) {
  const start = businessStartOfMonth(new Date(`${key}-15T00:00:00Z`));
  return { start, end: businessStartOfMonth(addDays(start, 45)) };
}

export function reportBounds(rawMonth: string | null | undefined, options: SupplierSalesReportOptions, now: Date) {
  const monthKey = normalizedReportMonth(rawMonth, now);
  const fallback = monthBounds(monthKey);
  const today = businessDayKey(now);
  const validDay = (value: string | null | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  let from = validDay(options.from) ? options.from! : businessDayKey(fallback.start);
  let to = validDay(options.to) ? options.to! : businessDayKey(addDays(fallback.end, -1));
  if (from > today) from = today;
  if (to > today) to = today;
  if (from > to) [from, to] = [to, from];
  const start = businessStartOfDay(new Date(`${from}T12:00:00Z`));
  const end = addDays(businessStartOfDay(new Date(`${to}T12:00:00Z`)), 1);
  return { monthKey, from, to, start, end };
}
