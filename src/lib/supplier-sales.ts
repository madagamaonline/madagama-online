import "server-only";

import type { SupplierAttribution, UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, businessMonthKey, businessStartOfMonth } from "@/lib/dates";
import { activeInvoiceWhere, nonTaxableEnabled } from "@/lib/tax-mode";
import { round2, toNum } from "@/lib/utils";
import { allocateInvoiceTotal } from "@/lib/supplier-sales-math";

export type SupplierSalesDetailRow = {
  kind: "SALE" | "RETURN";
  date: Date;
  invoiceNumber: string;
  supplierId: string | null;
  supplierName: string;
  attribution: SupplierAttribution | null;
  productId: string | null;
  productCode: string;
  productName: string;
  quantity: number;
  unit: UnitOfMeasure;
  sales: number;
  returns: number;
  cogs: number;
  returnedCogs: number;
};

export type SupplierSalesRow = {
  key: string;
  supplierId: string | null;
  supplierName: string;
  invoiceCount: number;
  productCount: number;
  sales: number;
  returns: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  inferredLineCount: number;
  unassignedLineCount: number;
};

export type VehicleSupplierSalesRow = {
  supplierId: string;
  supplierName: string;
  vehiclesSold: number;
  customerPrice: number;
  supplierSettlementDue: number;
  grossCommission: number;
  customerDiscount: number;
  netCommission: number;
  customerCollected: number;
};

export type SupplierSalesReport = {
  monthKey: string;
  monthLabel: string;
  generatedAt: Date;
  details: SupplierSalesDetailRow[];
  suppliers: SupplierSalesRow[];
  vehicleSuppliers: VehicleSupplierSalesRow[];
  totals: Omit<SupplierSalesRow, "key" | "supplierId" | "supplierName">;
};

export function normalizedReportMonth(raw: string | null | undefined, now = new Date()): string {
  const nowKey = businessMonthKey(now);
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= nowKey ? raw : nowKey;
}

function monthBounds(key: string) {
  const start = businessStartOfMonth(new Date(`${key}-15T00:00:00Z`));
  return { start, end: businessStartOfMonth(addDays(start, 45)) };
}

function supplierIdentity(item: {
  supplierAtSaleId: string | null;
  supplierNameSnapshot: string | null;
  supplierAttribution: SupplierAttribution | null;
}) {
  const name = item.supplierNameSnapshot?.trim();
  return {
    key: item.supplierAtSaleId ?? (name ? `snapshot:${name}` : "unassigned"),
    id: item.supplierAtSaleId,
    name: name || "Unassigned supplier",
    attribution: item.supplierAttribution,
  };
}

export async function getSupplierSalesReport(rawMonth?: string | null): Promise<SupplierSalesReport> {
  const generatedAt = new Date();
  const monthKey = normalizedReportMonth(rawMonth, generatedAt);
  const { start, end } = monthBounds(monthKey);
  const ntEnabled = await nonTaxableEnabled();
  const invoiceFilter = activeInvoiceWhere(ntEnabled);

  const [invoices, returns, vehicleSales] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: start, lt: end }, ...invoiceFilter },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        grandTotal: true,
        items: {
          orderBy: { id: "asc" },
          select: {
            productId: true,
            codeSnapshot: true,
            nameSnapshot: true,
            qty: true,
            unit: true,
            lineTotal: true,
            costSnapshot: true,
            supplierAtSaleId: true,
            supplierNameSnapshot: true,
            supplierAttribution: true,
            product: { select: { costPrice: true } },
          },
        },
      },
    }),
    prisma.salesReturn.findMany({
      where: { date: { gte: start, lt: end }, ...(ntEnabled ? {} : { invoice: invoiceFilter }) },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        date: true,
        invoice: {
          select: {
            invoiceNumber: true,
            items: {
              select: {
                productId: true,
                supplierAtSaleId: true,
                supplierNameSnapshot: true,
                supplierAttribution: true,
              },
            },
          },
        },
        items: {
          orderBy: { id: "asc" },
          select: {
            productId: true,
            qty: true,
            unit: true,
            lineTotal: true,
            costSnapshot: true,
            product: { select: { code: true, name: true, costPrice: true } },
          },
        },
      },
    }),
    prisma.vehicleSale.findMany({
      where: { saleDate: { gte: start, lt: end }, status: "CONFIRMED", voidedAt: null },
      select: {
        supplierNameSnapshot: true,
        customerPrice: true,
        supplierSettlementDue: true,
        grossDealerCommission: true,
        customerDiscount: true,
        netDealerCommission: true,
        customerCollected: true,
        vehicle: { select: { supplierId: true } },
      },
    }),
  ]);

  const details: SupplierSalesDetailRow[] = [];
  for (const invoice of invoices) {
    const lineSales = allocateInvoiceTotal(invoice.items.map((item) => toNum(item.lineTotal)), toNum(invoice.grandTotal));
    invoice.items.forEach((item, index) => {
      const supplier = supplierIdentity(item);
      details.push({
        kind: "SALE",
        date: invoice.createdAt,
        invoiceNumber: invoice.invoiceNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        attribution: supplier.attribution,
        productId: item.productId,
        productCode: item.codeSnapshot ?? "",
        productName: item.nameSnapshot,
        quantity: toNum(item.qty),
        unit: item.unit,
        sales: lineSales[index] ?? 0,
        returns: 0,
        cogs: round2(toNum(item.qty) * toNum(item.costSnapshot ?? item.product?.costPrice ?? 0)),
        returnedCogs: 0,
      });
    });
  }

  for (const customerReturn of returns) {
    for (const item of customerReturn.items) {
      const original = customerReturn.invoice?.items.find((invoiceItem) => invoiceItem.productId === item.productId);
      const supplier = supplierIdentity({
        supplierAtSaleId: original?.supplierAtSaleId ?? null,
        supplierNameSnapshot: original?.supplierNameSnapshot ?? null,
        supplierAttribution: original?.supplierAttribution ?? null,
      });
      details.push({
        kind: "RETURN",
        date: customerReturn.date,
        invoiceNumber: customerReturn.invoice?.invoiceNumber ?? "Unlinked return",
        supplierId: supplier.id,
        supplierName: supplier.name,
        attribution: supplier.attribution,
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.name,
        quantity: -toNum(item.qty),
        unit: item.unit,
        sales: 0,
        returns: toNum(item.lineTotal),
        cogs: 0,
        returnedCogs: round2(toNum(item.qty) * toNum(item.costSnapshot ?? item.product.costPrice)),
      });
    }
  }

  type Acc = Omit<SupplierSalesRow, "invoiceCount" | "productCount" | "netSales" | "cogs" | "grossProfit" | "marginPct"> & {
    invoiceIds: Set<string>;
    productIds: Set<string>;
    saleCogs: number;
    returnedCogs: number;
  };
  const grouped = new Map<string, Acc>();
  for (const detail of details) {
    const key = detail.supplierId ?? (detail.supplierName === "Unassigned supplier" ? "unassigned" : `snapshot:${detail.supplierName}`);
    const row = grouped.get(key) ?? {
      key,
      supplierId: detail.supplierId,
      supplierName: detail.supplierName,
      sales: 0,
      returns: 0,
      inferredLineCount: 0,
      unassignedLineCount: 0,
      invoiceIds: new Set<string>(),
      productIds: new Set<string>(),
      saleCogs: 0,
      returnedCogs: 0,
    };
    row.sales += detail.sales;
    row.returns += detail.returns;
    row.saleCogs += detail.cogs;
    row.returnedCogs += detail.returnedCogs;
    if (detail.kind === "SALE") row.invoiceIds.add(detail.invoiceNumber);
    if (detail.kind === "SALE" && detail.productId) row.productIds.add(detail.productId);
    if (detail.attribution === "LEGACY_INFERRED") row.inferredLineCount += 1;
    if (!detail.supplierId && detail.supplierName === "Unassigned supplier") row.unassignedLineCount += 1;
    grouped.set(key, row);
  }

  const suppliers = [...grouped.values()].map((row): SupplierSalesRow => {
    const sales = round2(row.sales);
    const returnsValue = round2(row.returns);
    const netSales = round2(sales - returnsValue);
    const cogs = round2(row.saleCogs - row.returnedCogs);
    const grossProfit = round2(netSales - cogs);
    return {
      key: row.key,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      invoiceCount: row.invoiceIds.size,
      productCount: row.productIds.size,
      sales,
      returns: returnsValue,
      netSales,
      cogs,
      grossProfit,
      marginPct: netSales === 0 ? 0 : round2((grossProfit / netSales) * 100),
      inferredLineCount: row.inferredLineCount,
      unassignedLineCount: row.unassignedLineCount,
    };
  }).sort((a, b) => b.netSales - a.netSales || a.supplierName.localeCompare(b.supplierName));

  const vehicleMap = new Map<string, VehicleSupplierSalesRow>();
  for (const sale of vehicleSales) {
    const id = sale.vehicle.supplierId;
    const row = vehicleMap.get(id) ?? { supplierId: id, supplierName: sale.supplierNameSnapshot, vehiclesSold: 0, customerPrice: 0, supplierSettlementDue: 0, grossCommission: 0, customerDiscount: 0, netCommission: 0, customerCollected: 0 };
    row.vehiclesSold += 1;
    row.customerPrice += toNum(sale.customerPrice);
    row.supplierSettlementDue += toNum(sale.supplierSettlementDue);
    row.grossCommission += toNum(sale.grossDealerCommission);
    row.customerDiscount += toNum(sale.customerDiscount);
    row.netCommission += toNum(sale.netDealerCommission);
    row.customerCollected += toNum(sale.customerCollected);
    vehicleMap.set(id, row);
  }
  const vehicleSuppliers = [...vehicleMap.values()].map((row) => ({ ...row, customerPrice: round2(row.customerPrice), supplierSettlementDue: round2(row.supplierSettlementDue), grossCommission: round2(row.grossCommission), customerDiscount: round2(row.customerDiscount), netCommission: round2(row.netCommission), customerCollected: round2(row.customerCollected) })).sort((a, b) => b.netCommission - a.netCommission);

  const allInvoiceNumbers = new Set(details.filter((row) => row.kind === "SALE").map((row) => row.invoiceNumber));
  const allProductIds = new Set(details.flatMap((row) => row.kind === "SALE" && row.productId ? [row.productId] : []));
  const totals = suppliers.reduce((total, row) => ({
    invoiceCount: allInvoiceNumbers.size,
    productCount: allProductIds.size,
    sales: round2(total.sales + row.sales),
    returns: round2(total.returns + row.returns),
    netSales: round2(total.netSales + row.netSales),
    cogs: round2(total.cogs + row.cogs),
    grossProfit: round2(total.grossProfit + row.grossProfit),
    marginPct: 0,
    inferredLineCount: total.inferredLineCount + row.inferredLineCount,
    unassignedLineCount: total.unassignedLineCount + row.unassignedLineCount,
  }), { invoiceCount: 0, productCount: 0, sales: 0, returns: 0, netSales: 0, cogs: 0, grossProfit: 0, marginPct: 0, inferredLineCount: 0, unassignedLineCount: 0 });
  totals.marginPct = totals.netSales === 0 ? 0 : round2((totals.grossProfit / totals.netSales) * 100);

  return {
    monthKey,
    monthLabel: new Date(`${monthKey}-01T12:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    generatedAt,
    details,
    suppliers,
    vehicleSuppliers,
    totals,
  };
}
