import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { getTaxReport, type TaxTotals } from "@/lib/tax-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const moneyFormat = '"LKR" #,##0.00;[Red]-"LKR" #,##0.00';
function style(sheet: ExcelJS.Worksheet, moneyColumns: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4D3A" } };
  header.height = 24;
  moneyColumns.forEach((column) => { sheet.getColumn(column).numFmt = moneyFormat; });
  sheet.columns.forEach((column) => {
    let width = 14;
    column.eachCell?.({ includeEmpty: true }, (cell) => { width = Math.max(width, String(cell.value ?? "").length + 2); });
    column.width = Math.min(width, 45);
  });
}
function amounts(row: TaxTotals) { return [row.taxable, row.nonTaxable, row.unclassified, row.total]; }

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const report = await getTaxReport(new URL(request.url).searchParams.get("month") ?? undefined);
  const book = new ExcelJS.Workbook();
  book.creator = "Madagama";
  book.created = new Date();

  const company = book.addWorksheet("Company Summary");
  company.addRow(["Metric", "Taxable", "Non-taxable", "Unclassified", "All"]);
  for (const [label, values] of [
    ["Gross sales", report.sales], ["Customer refunds", report.refunds], ["Net sales", report.netSales],
    ["Purchases (line values)", report.purchases], ["Supplier returns (line values)", report.supplierReturns], ["Net purchases", report.netPurchases],
  ] as const) company.addRow([label, ...amounts(values)]);
  company.addRow(["Reporting month", report.label]);
  company.addRow(["Purchase header total", report.purchaseHeaderTotal]);
  company.addRow(["Supplier return header total", report.supplierReturnHeaderTotal]);
  company.addRow(["Purchase classification uses each product’s current taxable flag; historical purchase category was not stored."]);
  style(company, [2, 3, 4, 5]);

  const daily = book.addWorksheet("Daily Sales");
  daily.addRow(["Day", "Taxable", "Non-taxable", "Unclassified", "All"]);
  for (const row of report.daily) daily.addRow([row.day, row.taxable, row.nonTaxable, row.unclassified, row.total]);
  style(daily, [2, 3, 4, 5]);

  const salesSuppliers = book.addWorksheet("Sales by Supplier");
  salesSuppliers.addRow(["Supplier", "Taxable sales", "Non-taxable sales", "Total sales", "Taxable returns", "Non-taxable returns", "Unclassified returns", "Total returns", "Taxable net", "Non-taxable net", "Unclassified net", "Total net"]);
  for (const row of report.supplierSales) salesSuppliers.addRow([row.supplier, row.sales.taxable, row.sales.nonTaxable, row.sales.total, row.returns.taxable, row.returns.nonTaxable, row.returns.unclassified, row.returns.total, row.net.taxable, row.net.nonTaxable, row.net.unclassified, row.net.total]);
  style(salesSuppliers, Array.from({ length: 11 }, (_, i) => i + 2));

  const purchaseSuppliers = book.addWorksheet("Purchases by Supplier");
  purchaseSuppliers.addRow(["Supplier", "Taxable purchases", "Non-taxable purchases", "Total purchases", "Taxable returns", "Non-taxable returns", "Total returns", "Taxable net", "Non-taxable net", "Total net"]);
  for (const row of report.supplierPurchases) purchaseSuppliers.addRow([row.supplier, row.purchases.taxable, row.purchases.nonTaxable, row.purchases.total, row.returns.taxable, row.returns.nonTaxable, row.returns.total, row.net.taxable, row.net.nonTaxable, row.net.total]);
  style(purchaseSuppliers, Array.from({ length: 9 }, (_, i) => i + 2));

  const invoices = book.addWorksheet("Invoices");
  invoices.addRow(["Date", "Invoice", "Category", "Customer", "Type", "Gross sales"]);
  for (const row of report.invoices) invoices.addRow([row.createdAt, row.invoiceNumber, row.taxCategory, row.customer?.name ?? "Walk-in customer", row.type, Number(row.grandTotal)]);
  invoices.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  style(invoices, [6]);

  const saleLines = book.addWorksheet("Supplier Sales Detail");
  saleLines.addRow(["Date", "Activity", "Category", "Invoice", "Supplier", "Product code", "Product", "Quantity", "Sales", "Customer returns", "COGS", "Returned COGS", "Customer", "Cashier", "Salesperson", "Attribution"]);
  for (const row of report.supplierSalesDetails) saleLines.addRow([row.date, row.kind, row.taxCategory ?? "UNCLASSIFIED", row.invoiceNumber, row.supplierName, row.productCode, row.productName, row.quantity, row.sales, row.returns, row.cogs, row.returnedCogs, row.customerName, row.cashierName, row.salespersonName, row.attribution ?? "UNASSIGNED"]);
  saleLines.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  style(saleLines, [9, 10, 11, 12]);

  const purchaseLines = book.addWorksheet("Purchase Lines");
  purchaseLines.addRow(["Date", "Supplier", "Reference", "Product", "Quantity", "Current category", "Line value"]);
  for (const row of report.purchaseLines) purchaseLines.addRow([row.date, row.supplier, row.reference, row.product, row.quantity, row.category, row.amount]);
  purchaseLines.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  style(purchaseLines, [7]);

  const customerReturns = book.addWorksheet("Customer Return Lines");
  customerReturns.addRow(["Date", "Invoice or return", "Category", "Product", "Quantity", "Refund line value"]);
  for (const row of report.customerReturnLines) customerReturns.addRow([row.date, row.reference, row.category ?? "UNCLASSIFIED", row.product, row.quantity, row.amount]);
  customerReturns.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  style(customerReturns, [6]);

  const supplierReturns = book.addWorksheet("Supplier Return Lines");
  supplierReturns.addRow(["Date", "Supplier", "Return ID", "Current category", "Product", "Quantity", "Return line value"]);
  for (const row of report.supplierReturnLines) supplierReturns.addRow([row.date, row.supplier, row.reference, row.category, row.product, row.quantity, row.amount]);
  supplierReturns.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  style(supplierReturns, [7]);

  const buffer = await book.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tax-ledger-${report.month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
